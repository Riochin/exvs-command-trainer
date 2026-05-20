'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';

export interface AuthButtonProps {
  className?: string;
}

export function AuthButton({ className }: AuthButtonProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return null;
  }

  if (status === 'authenticated' && session?.user) {
    const { name, image } = session.user;
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {image && (
          <Image
            src={image}
            alt={name ?? 'ユーザー'}
            width={32}
            height={32}
            style={{ borderRadius: '50%' }}
          />
        )}
        <span>{name}</span>
        <button type="button" onClick={() => void signOut()}>
          ログアウト
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void signIn('google')}
    >
      ログイン
    </button>
  );
}
