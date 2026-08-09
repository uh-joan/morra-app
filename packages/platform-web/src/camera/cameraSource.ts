// cameraSource.ts — camera device acquisition, ported from
// spikes/s03-beat.html's startCamera (the 480x360 request constraints are
// preserved exactly). The spike never handled mid-session device loss or
// enumeration changes — this is NEW platform-web architecture per the M3
// dispatch ("platform-web owns ALL device access... incl. device-change/
// track-ended handling"), since a real deployment needs to notice a camera
// being unplugged or permissions revoked mid-game rather than just going
// silently dark.
export const DEFAULT_CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: 480,
  height: 360,
};

export type CameraEndedListener = (reason: "track-ended") => void;
export type CameraDeviceChangeListener = () => void;

export class CameraSource {
  private stream: MediaStream | null = null;
  private endedListener: CameraEndedListener | null = null;
  private deviceChangeListener: CameraDeviceChangeListener | null = null;
  private boundTrackEnded: (() => void) | null = null;

  async start(constraints: MediaTrackConstraints = DEFAULT_CAMERA_CONSTRAINTS): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    if (track) {
      this.boundTrackEnded = () => this.endedListener?.("track-ended");
      track.addEventListener("ended", this.boundTrackEnded);
    }
    return stream;
  }

  /** Fires when the active video track ends unexpectedly (device unplugged,
   * permission revoked mid-session, OS-level camera takeover, ...). */
  onEnded(listener: CameraEndedListener): void {
    this.endedListener = listener;
  }

  /** Fires on navigator.mediaDevices "devicechange" — callers can re-run
   * device enumeration/prompt the user to pick a different camera. */
  onDeviceChange(listener: CameraDeviceChangeListener): void {
    this.deviceChangeListener = listener;
    navigator.mediaDevices.addEventListener("devicechange", listener);
  }

  stop(): void {
    const track = this.stream?.getVideoTracks()[0];
    if (track && this.boundTrackEnded) track.removeEventListener("ended", this.boundTrackEnded);
    this.boundTrackEnded = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.deviceChangeListener) {
      navigator.mediaDevices.removeEventListener("devicechange", this.deviceChangeListener);
      this.deviceChangeListener = null;
    }
    this.endedListener = null;
  }
}
