/** Image files imported by components: Metro gives an asset id, Vite (tests) a URL. */
declare module "*.jpg" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}
