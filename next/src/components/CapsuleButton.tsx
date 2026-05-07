'use client';

import Link from 'next/link';
import styles from './CapsuleButton.module.css';

type CapsuleButtonVariant = 'primary' | 'danger';
type CapsuleButtonSize = 'sm' | 'md' | 'lg';

interface CapsuleButtonProps {
  variant?: CapsuleButtonVariant;
  size?: CapsuleButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  href?: string;
}

export function CapsuleButton({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  children,
  className,
  type = 'button',
  href,
}: CapsuleButtonProps) {
  const classNames = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ');

  if (href) {
    return (
      <Link href={href} className={classNames}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={classNames}>
      {children}
    </button>
  );
}
