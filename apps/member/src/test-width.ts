/** Sets the screen width react-native-web reports, so a test renders the phone or the computer layout. */
export function setWidth(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

export const COMPUTER = 1280;
export const PHONE = 390;
