declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG(image: ImageData, options?: Record<string, unknown> | string): string;
  };
  export default ImageTracer;
}
