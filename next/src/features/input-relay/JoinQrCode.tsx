'use client';

/**
 * スマホで読み取るとそのまま PC につながる QR コード。
 * 読み取り先は `<サイト>/practice?relay=<コード>`（フリー練習）。スマホ側のどのページでも ?relay= でつながる。
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import styles from './InputRelayHostApp.module.css';

export function joinUrl(origin: string, room: string): string {
  return `${origin}/practice?relay=${room}`;
}

export function JoinQrCode({ origin, room }: { origin: string | null; room: string | null }) {
  const [dataUrl, setDataUrl] = useState<{ key: string; url: string } | null>(null);
  const key = origin && room ? joinUrl(origin, room) : null;

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    QRCode.toDataURL(key, { margin: 1, width: 168, color: { dark: '#111113', light: '#f1f1ee' } })
      .then((url) => {
        if (!cancelled) setDataUrl({ key, url });
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === null || dataUrl?.key !== key) return <div className={styles.qrPlaceholder} aria-hidden="true" />;
  return (
    <figure className={styles.qr}>
      {/* data URL の画像なので next/image の最適化は不要 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl.url} alt={`スマホで読み取ると ${key} を開きます`} width={168} height={168} />
      <figcaption className={styles.qrCaption}>スマホで読み取る</figcaption>
    </figure>
  );
}
