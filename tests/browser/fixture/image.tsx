import type { ImgHTMLAttributes } from "react";

type FixtureImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
  unoptimized?: boolean;
};

export default function Image({ unoptimized: _unoptimized, ...props }: FixtureImageProps) {
  // Test-only next/image shim; production components still use next/image.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} />;
}
