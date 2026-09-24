declare module "heic-decode" {
  export interface DecodedHeic {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  export interface DecodedHeicImage {
    width: number;
    height: number;
    decode(): Promise<DecodedHeic>;
  }

  export interface DecodedHeicImages extends Array<DecodedHeicImage> {
    dispose(): void;
  }

  interface Decoder {
    (input: { buffer: Buffer }): Promise<DecodedHeic>;
    all(input: { buffer: Buffer }): Promise<DecodedHeicImages>;
  }

  const decode: Decoder;
  export default decode;
}
