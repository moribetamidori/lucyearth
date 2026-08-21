import { BirthdayAudioProvider } from './BirthdayAudio';

export default function BirthdayLayout({ children }: { children: React.ReactNode }) {
  return <BirthdayAudioProvider>{children}</BirthdayAudioProvider>;
}
