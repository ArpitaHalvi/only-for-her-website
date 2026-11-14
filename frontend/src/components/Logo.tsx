import Image from "next/image";
import logo from "@/public/only-for-her-logo.png";
import logoLight from "@/public/only-for-her-logo-light.png";

type Props = {
  /** Rendered height in px; width follows the logo's aspect ratio. */
  height?: number;
  /** Ivory lettering for dark backgrounds (the footer). */
  light?: boolean;
  priority?: boolean;
};

/** The logo has a transparent background: it sits directly on the page. */
export default function Logo({ height = 60, light = false, priority = false }: Props) {
  const src = light ? logoLight : logo;
  const width = Math.round((src.width / src.height) * height);
  return <Image src={src} alt="Only For Her Jewellery" width={width} height={height} priority={priority} className="brand-logo" />;
}
