import { useWindowDimensions } from 'react-native';
import {
  getContentPadding,
  getSignalCardLayout,
  isCompactWidth,
  isMobileWidth,
} from '../constants/layout';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isMobile = isMobileWidth(width);
  const isCompact = isCompactWidth(width);

  return {
    width,
    height,
    isMobile,
    isCompact,
    isDesktop: !isMobile,
    contentPadding: getContentPadding(isCompact, isMobile),
    signalCardLayout: getSignalCardLayout(isMobile),
    useJournalCards: isMobile,
  };
}
