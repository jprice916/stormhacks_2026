interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      src={`${import.meta.env.BASE_URL}images/logo.png`}
    />
  );
}
