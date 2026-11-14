/**
 * Small helpers around navigator.mediaDevices for the call screen.
 */

/**
 * The audio outputs someone can really switch between. Browsers also list
 * "default" and "communications": those are second names for one of the real
 * devices, so counting them would offer a switch that changes nothing. Before
 * microphone permission is given every id is empty; those are left out too.
 */
export function realAudioOutputs(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return devices.filter(
    (d) =>
      d.kind === "audiooutput" &&
      d.deviceId !== "" &&
      d.deviceId !== "default" &&
      d.deviceId !== "communications",
  );
}

/** True when this browser can play call audio on a chosen output (setSinkId). */
export function canChooseAudioOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/** How many cameras there are. Two or more means "Flip" has something to do. */
export function cameraCount(devices: MediaDeviceInfo[]): number {
  return devices.filter((d) => d.kind === "videoinput").length;
}
