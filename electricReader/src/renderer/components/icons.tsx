import type { ReactNode, SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function ArrowLeftIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Icon>
  )
}

export function BookOpenIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M2.5 5.5A2.5 2.5 0 0 1 5 3h5.5A2.5 2.5 0 0 1 13 5.5V21a3 3 0 0 0-3-3H5a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M21.5 5.5A2.5 2.5 0 0 0 19 3h-5.5A2.5 2.5 0 0 0 11 5.5V21a3 3 0 0 1 3-3h5a2.5 2.5 0 0 0 2.5-2.5z" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function GridIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  )
}

export function ListIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Icon>
  )
}

export function MoreIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </Icon>
  )
}

export function XIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

export function TocIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M21 6H8M21 12H8M21 18H8" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Icon>
  )
}

export function TypeIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </Icon>
  )
}

export function SunIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Icon>
  )
}

export function MonitorIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  )
}

export function CheckCircleIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  )
}

export function AlertTriangleIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M10.3 3.6 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  )
}

export function InfoIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  )
}

export function RefreshIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
    </Icon>
  )
}

export function UploadIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  )
}

export function LoaderIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props} className={props.className ?? 'er-spin'}>
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </Icon>
  )
}

export function BookmarkIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-6-4.5L6 21z" />
    </Icon>
  )
}

export function FileWarningIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M12 11v4M12 18h.01" />
    </Icon>
  )
}

export function LocateIcon(props: IconProps): ReactNode {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="7" />
    </Icon>
  )
}

export function BrandMark({ size = 34 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="10" fill="var(--er-accent)" />
      <path
        d="M20 11.5c-2.8-1.7-6.2-2.2-9-1.6v17.8c2.8-.6 6.2-.1 9 1.6 2.8-1.7 6.2-2.2 9-1.6V9.9c-2.8-.6-6.2-.1-9 1.6z"
        fill="none"
        stroke="var(--er-elevated)"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M20 11.5v17.8" stroke="var(--er-elevated)" strokeWidth="1.9" />
    </svg>
  )
}
