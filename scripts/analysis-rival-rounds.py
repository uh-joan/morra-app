# analysis-rival-rounds.py — the offline analysis behind
# docs/rival-intelligence-research.md: builds the resolved-rounds dataset from
# spikes/logs/*.ndjson (game_reveal events), measures how predictable the
# players are (context predictors + BMA, per channel f/g, per session), probes
# the human tells, and replays (f,g) policies against the real rounds.
# Python 3, stdlib only. Run from the repo root:
#   python3 scripts/analysis-rival-rounds.py
# (Its successor will be scripts/eval-rival.mjs, replaying the REAL core
# predictors from packages/core so ai.ts changes are measured.)
import json, math, glob, os
from collections import defaultdict, Counter
sessions=defaultdict(list)
for f in glob.glob('spikes/logs/*.ndjson'):
    for l in open(f, errors='ignore'):
        if '"game_reveal"' not in l: continue
        try: e=json.loads(l)
        except: continue
        if e.get('type')!='game_reveal': continue
        pf,pc,af,ac,w=e.get('playerFingers'),e.get('playerCallNumber'),e.get('aiFingers'),e.get('aiCall'),e.get('verdictWinner')
        if None in (pf,pc,af,ac,w): continue
        sessions[e['sessionId']].append((e['throwIndex'],pf,pc-pf,af,ac-af,w, os.path.getmtime(f)))
S=dict(sessions)
# order sessions by time, rounds by throwIndex
sess=sorted(S.items(), key=lambda kv: kv[1][0][6])
V=[1,2,3,4,5]
def norm(c):
    t=sum(c.values()); return {v:(c.get(v,0)/t if t>0 else .2) for v in V}
def dirichlet(c, alpha=0.5):
    t=sum(c.values())+alpha*5; return {v:(c.get(v,0)+alpha)/t for v in V}
def decayed_counts(items, hl):
    # items: list of values oldest→newest
    c=Counter(); n=len(items)
    for i,v in enumerate(items):
        if v is None: continue
        c[v]+=0.5**((n-1-i)/hl)
    return c
# ---- context predictors: each returns dist given history rows (list of dicts) for target key
def ctx_pred(rows, key, ctxfn, hl=None, alpha=0.5, min_n=1):
    """rows: past rows; ctxfn(row_prev)->context tuple, using row t-1 (and maybe t-2). Predict rows[-1] context → next."""
    if len(rows)<1: return None
    target_ctx=ctxfn(rows, len(rows))  # context for the NEXT throw uses rows up to end
    if target_ctx is None: return None
    vals=[]; ws=[]
    for i in range(1,len(rows)):
        c=ctxfn(rows, i)  # context available before row i
        if c==target_ctx and rows[i].get(key) in V:
            vals.append((i,rows[i][key]))
    if len(vals)<min_n: return None
    n=len(rows)
    c=Counter()
    for i,v in vals: c[v]+= (0.5**((n-1-i)/hl) if hl else 1)
    if sum(c.values())<=0: return None
    return dirichlet(c, alpha)
def C_none(rows,i): return ()
def C_prevf(rows,i): return (rows[i-1]['f'],) if i>=1 else None
def C_prev2f(rows,i): return (rows[i-2]['f'],rows[i-1]['f']) if i>=2 else None
def C_prevaf(rows,i): return (rows[i-1]['af'],) if i>=1 else None
def C_prevw(rows,i): return (rows[i-1]['w'],) if i>=1 else None
def C_prevw_f(rows,i): return (rows[i-1]['w'],rows[i-1]['f']) if i>=1 else None
def C_prevg(rows,i): return (rows[i-1]['g'],) if i>=1 else None
def C_prevaf_f(rows,i): return (rows[i-1]['af'],rows[i-1]['f']) if i>=1 else None
def C_prevtotal(rows,i): return (rows[i-1]['f']+rows[i-1]['af'],) if i>=1 else None
PREDS={
 'uniform': lambda rows,key: {v:.2 for v in V},
 'marginal': lambda rows,key: ctx_pred(rows,key,C_none),
 'freq_hl20': lambda rows,key: ctx_pred(rows,key,C_none,hl=20),
 'order1': lambda rows,key: ctx_pred(rows,key,C_prevf,hl=20),
 'order2': lambda rows,key: ctx_pred(rows,key,C_prev2f,hl=20,min_n=2),
 'prev_ai_f': lambda rows,key: ctx_pred(rows,key,C_prevaf,hl=20),
 'prev_outcome': lambda rows,key: ctx_pred(rows,key,C_prevw,hl=20),
 'outcome+prevf': lambda rows,key: ctx_pred(rows,key,C_prevw_f,hl=20,min_n=2),
 'prev_g': lambda rows,key: ctx_pred(rows,key,C_prevg,hl=20),
 'prev_total': lambda rows,key: ctx_pred(rows,key,C_prevtotal,hl=20),
}
BMA_NAMES=['marginal','freq_hl20','order1','order2','prev_ai_f','prev_outcome','outcome+prevf','prev_g','prev_total']
def evaluate(key, cross_session=False, min_hist=5, eta=1.0, decay=0.98):
    names=list(PREDS)
    hit=Counter(); ph=Counter(); n=0
    hit_bma=0; ph_bma=0
    prior=[]; ll={nm:0.0 for nm in BMA_NAMES}
    for sid,rs in sess:
        rows=[]
        base=prior if cross_session else []
        if not cross_session: ll={nm:0.0 for nm in BMA_NAMES}
        for (ti,pf,pg,af,ag,w,_) in rs:
            r={'f':pf,'g':pg,'af':af,'ag':ag,'w':w}
            hist=base+rows
            if len(hist)>=1 and r[key] in V:
                cur={nm:(PREDS[nm](hist,key) or {v:.2 for v in V}) for nm in names}
                if len(hist)>=min_hist:
                    n+=1
                    for nm in names:
                        d=cur[nm]; best=max(V,key=lambda v:d[v]); hit[nm]+=(best==r[key]); ph[nm]+=d[r[key]]
                    ws={nm:math.exp(eta*ll[nm]) for nm in BMA_NAMES}; tot=sum(ws.values()) or 1
                    d={v:sum(ws[nm]*cur[nm][v] for nm in BMA_NAMES)/tot for v in V}
                    best=max(V,key=lambda v:d[v]); hit_bma+=(best==r[key]); ph_bma+=d[r[key]]
                # update BMA log-likelihoods with what each predictor said about THIS actual
                for nm in BMA_NAMES: ll[nm]=decay*ll[nm]+math.log(max(cur[nm][r[key]],1e-6))
            rows.append(r)
        prior=prior+rows
    print(f"\n== target={key} cross_session={cross_session}  n={n}")
    print(f"{'predictor':16s} argmax-hit  sample-hit")
    for nm in names: print(f"{nm:16s} {100*hit[nm]/n:8.1f}%  {100*ph[nm]/n:8.1f}%")
    print(f"{'BMA(all ctx)':16s} {100*hit_bma/n:8.1f}%  {100*ph_bma/n:8.1f}%")
evaluate('f', False)
evaluate('f', True)
evaluate('g', False)
evaluate('g', True)

# ---- per-session predictability (top sessions) + human-bias probes
print("\n\n=== per-session: best predictor argmax-hit on f / g (min_hist 5) ===")
def eval_session(rs, key):
    rows=[]; hit=Counter(); n=0
    for (ti,pf,pg,af,ag,w,_) in rs:
        r={'f':pf,'g':pg,'af':af,'ag':ag,'w':w}
        if len(rows)>=5 and r[key] in V:
            n+=1
            for nm in ('marginal','order1','prev_outcome','prev_ai_f','prev_g'):
                d=PREDS[nm](rows,key) or {v:.2 for v in V}; hit[nm]+=(max(V,key=lambda v:d[v])==r[key])
        rows.append(r)
    return n, {nm:round(100*h/n) for nm,h in hit.items()} if n else {}
for sid,rs in sorted(sess, key=lambda kv:-len(kv[1]))[:8]:
    nf,hf=eval_session(rs,'f'); ng,hg=eval_session(rs,'g')
    print(f"{sid} n={len(rs):3d}  f: {hf}   g: {hg}")
print("\n=== human-bias probes (pooled, in-session pairs) ===")
rep=alt=n=0; after=defaultdict(Counter); same_as_ai=0; g_eq_prev_af=0; g_eq_prev_f=0; ng=0
for sid,rs in sess:
    for i in range(1,len(rs)):
        _,pf,pg,af,ag,w,_=rs[i]; _,pf0,pg0,af0,ag0,w0,_=rs[i-1]
        n+=1; rep+=(pf==pf0); same_as_ai+=(pf==af0)
        after[w0][ 'repeat' if pf==pf0 else 'change']+=1
        if pg in V: ng+=1; g_eq_prev_af+=(pg==af0); g_eq_prev_f+=(pg==pf0)
print(f"P(repeat own f) = {rep/n:.2f} (uniform .20)   P(f == rival's last f) = {same_as_ai/n:.2f}")
for w0 in ('player','ai','parata'): c=after[w0]; t=sum(c.values()); print(f"  after {w0:6s}: repeat {c['repeat']/t:.2f}  (n={t})")
print(f"P(guess == rival's LAST fingers) = {g_eq_prev_af/ng:.2f}   P(guess == own last f) = {g_eq_prev_f/ng:.2f}   (uniform .20)")
# g|f joint: is the guess tied to own fingers?
jf=defaultdict(Counter)
for sid,rs in sess:
    for _,pf,pg,af,ag,w,_ in rs:
        if pg in V: jf[pf][pg]+=1
print("guess distribution given own fingers (rows f, cols g=1..5):")
for f in V:
    t=sum(jf[f].values()); print(f"  f={f} n={t:4d}: "+"  ".join(f"{jf[f][g]/t:.2f}" for g in V)+ f"   → most likely call total {f+max(V,key=lambda g:jf[f][g])}")

# ---- policy replay: EV of an (f,g) policy against the real players
print("\n\n=== POLICY REPLAY (in-session, min_hist 5): per-round outcome rates ===")
import random
random.seed(1)
def joint_g_pred(rows):
    """q(g) = sum_f p(f) * p(g|f): the player's guess marginalized over their predicted fingers."""
    pf=PREDS['order1'](rows,'f') or PREDS['marginal'](rows,'f') or {v:.2 for v in V}
    q={v:0.0 for v in V}
    for f in V:
        c=Counter(r['g'] for r in rows if r['f']==f and r['g'] in V)
        d=dirichlet(c,0.5) if sum(c.values())>0 else (PREDS['marginal'](rows,'g') or {v:.2 for v in V})
        for g in V: q[g]+=pf[f]*d[g]
    return q
def sample(d, tau):
    w={v:max(d[v],1e-9)**(1/tau) for v in V}; t=sum(w.values()); r=random.random()*t; c=0
    for v in V:
        c+=w[v]
        if r<c: return v
    return 5
def replay(policy_name, pick_g, pick_f, tau=None):
    n=0; aiwin=plwin=par=0; aihit=plhit=0
    for sid,rs in sess:
        rows=[]
        for (ti,pf,pg,af,ag,w,_) in rs:
            r={'f':pf,'g':pg,'af':af,'ag':ag,'w':w}
            if len(rows)>=5 and pg in V:
                pfd = PREDS['order1'](rows,'f') or PREDS['marginal'](rows,'f') or {v:.2 for v in V}
                # blend with marginal (BMA-lite)
                mf = PREDS['marginal'](rows,'f') or {v:.2 for v in V}
                pfd = {v:0.5*pfd[v]+0.5*mf[v] for v in V}
                qg = pick_f(rows)
                g_ai = max(V,key=lambda v:pfd[v]) if tau is None else sample(pfd,tau)
                f_ai = min(V,key=lambda v:qg[v]) if tau is None else sample({v:1-qg[v] for v in V},tau)
                ai_ok=(g_ai==pf); pl_ok=(pg==f_ai)
                n+=1; aihit+=ai_ok; plhit+=pl_ok
                if ai_ok and not pl_ok: aiwin+=1
                elif pl_ok and not ai_ok: plwin+=1
                else: par+=1
            rows.append(r)
    print(f"{policy_name:34s} n={n}  AI aim {100*aihit/n:4.1f}%  player hit {100*plhit/n:4.1f}%  →  AI wins {100*aiwin/n:4.1f}%  player wins {100*plwin/n:4.1f}%  parata {100*par/n:4.1f}%")
uni=lambda rows:{v:.2 for v in V}
qmarg=lambda rows: PREDS['freq_hl20'](rows,'g') or {v:.2 for v in V}
qprevaf=lambda rows: PREDS['prev_ai_f'](rows,'g') or qmarg(rows)
print("actual game (all levels, from logs):  AI wins ~16%, player wins ~17%, parata ~67%; AI aim 19.7%, player hit 21.1%")
replay("uniform f, uniform g (L2)", None, uni, tau=1.0)
replay("aim only, f uniform (≈L3), argmax", None, uni)
replay("aim + anti-aim (g marginal), argmax", None, qmarg)
replay("aim + anti-aim (joint f→g), argmax", None, joint_g_pred)
replay("aim + anti-aim (joint), sample τ=0.5", None, joint_g_pred, tau=0.5)
replay("aim + anti-aim (joint), sample τ=0.3", None, joint_g_pred, tau=0.3)
