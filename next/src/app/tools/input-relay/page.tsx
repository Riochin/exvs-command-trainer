import { redirect } from 'next/navigation';

/** 旧 URL。3D ビューは /3d に移った */
export default function InputRelayPage() {
  redirect('/3d');
}
