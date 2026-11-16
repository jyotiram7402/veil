export function realAudioOutputs(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return devices.filter(
    (d) =>
      d.kind === "audiooutput" &&
      d.deviceId !== "" &&
      d.deviceId !== "default" &&
      d.deviceId !== "communications",
  );
}

export function canChooseAudioOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

export function cameraCount(devices: MediaDeviceInfo[]): number {
  return devices.filter((d) => d.kind === "videoinput").length;
}
