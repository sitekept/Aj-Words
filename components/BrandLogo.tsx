import { cx } from "@/components/ui";

interface BrandLogoProps {
  className?: string;
  title?: string;
}

export function BrandLogo({ className, title = "AJ Words" }: BrandLogoProps) {
  return (
    <svg
      className={cx("brand-logo", className)}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${title} logo`}
      focusable="false"
    >
      <path
        d="M12.1 18.3c-.6-3.6 1.8-7 5.4-7.7l25.7-4.5c3.6-.6 7 1.8 7.6 5.4l6.2 35.1c.6 3.6-1.8 7-5.4 7.6l-25.7 4.6c-3.6.6-7-1.8-7.6-5.4L12.1 18.3Z"
        fill="#2D6F68"
      />
      <path
        d="M18.4 13.3c0-3.7 3-6.7 6.7-6.7h25.3c3.7 0 6.7 3 6.7 6.7v37.4c0 3.7-3 6.7-6.7 6.7H25.1c-3.7 0-6.7-3-6.7-6.7V13.3Z"
        fill="#FFFCF4"
        stroke="#182D36"
        strokeWidth="3"
      />
      <path
        d="m26.2 43.5 6.2-23 6.2 23"
        fill="none"
        stroke="#F26D5B"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.6"
      />
      <path
        d="M29.3 34.8h6.4"
        fill="none"
        stroke="#F26D5B"
        strokeLinecap="round"
        strokeWidth="4.1"
      />
      <path
        d="M45.2 20.8v15.7c0 5.2-3.2 8-7.4 7.4-1.7-.3-3.1-1-4.1-2.1"
        fill="none"
        stroke="#4C5BD5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.4"
      />
      <path
        d="M24.6 15.5h17.2"
        fill="none"
        stroke="#CDEEE8"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}
