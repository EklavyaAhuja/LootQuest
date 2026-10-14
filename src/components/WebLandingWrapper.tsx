import React from 'react';

interface WebLandingWrapperProps {
  children: React.ReactNode;
}

export default function WebLandingWrapper({ children }: WebLandingWrapperProps) {
  return <>{children}</>;
}
