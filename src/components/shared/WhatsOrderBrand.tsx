import Image from "next/image";

export function WhatsOrderBrand({
  className = "",
  imageClassName = "h-9 w-9",
  label = "WhatsOrder",
  labelClassName = ""
}: {
  className?: string;
  imageClassName?: string;
  label?: string;
  labelClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        alt=""
        aria-hidden
        className={`shrink-0 object-contain ${imageClassName}`}
        height={512}
        priority
        src="/icons/whatsorder-mark.png"
        width={512}
      />
      <span className={labelClassName}>{label}</span>
    </span>
  );
}
