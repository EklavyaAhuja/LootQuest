declare module 'lucide-react-native' {
  import { FC } from 'react';
  import { ViewStyle, StyleProp } from 'react-native';

  export interface LucideProps {
    size?: number | string;
    color?: string;
    style?: StyleProp<ViewStyle>;
    fill?: string;
  }

  export type LucideIcon = FC<LucideProps>;

  export const Radio: LucideIcon;
  export const Settings: LucideIcon;
  export const Gamepad2: LucideIcon;
  export const Search: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Filter: LucideIcon;
  export const Gamepad: LucideIcon;
  export const X: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Share2: LucideIcon;
  export const CheckSquare: LucideIcon;
  export const Square: LucideIcon;
  export const Sparkles: LucideIcon;
  export const HelpCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const MessageCircle: LucideIcon;
  export const Key: LucideIcon;
  export const Bell: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Trash2: LucideIcon;
  export const Clock: LucideIcon;
  export const ShieldAlert: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Layers: LucideIcon;
  export const SlidersHorizontal: LucideIcon;
  export const ArrowUpDown: LucideIcon;


  export const Home: LucideIcon;
  export const Inbox: LucideIcon;
  export const User: LucideIcon;
  export const Menu: LucideIcon;
  export const Check: LucideIcon;
  export const Volume2: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const Terminal: LucideIcon;
  export const Trophy: LucideIcon;
  export const Rocket: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const Loader2: LucideIcon;
  export const Heart: LucideIcon;
  export const Star: LucideIcon;
  export const Flame: LucideIcon;
  export const Zap: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const LogOut: LucideIcon;
  export const Award: LucideIcon;
  export const Plus: LucideIcon;
  export const Tag: LucideIcon;
  export const Calendar: LucideIcon;
  export const WifiOff: LucideIcon;
  export const Monitor: LucideIcon;
  export const Smartphone: LucideIcon;
  export const Globe: LucideIcon;
}
