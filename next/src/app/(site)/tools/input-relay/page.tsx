import { redirect } from 'next/navigation';

/** 旧 URL。3D ビューはトップ（/）に移った */
export default function InputRelayPage() {
  redirect('/');
}
