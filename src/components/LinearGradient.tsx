import React, { useState, useRef } from 'react';
import { View, StyleSheet, ViewProps, LayoutChangeEvent, Platform } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';

export interface LinearGradientProps extends ViewProps {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: number[];
  children?: React.ReactNode;
}

export const LinearGradient: React.FC<LinearGradientProps> = ({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  locations,
  style,
  children,
  ...props
}) => {
  const gradientIdRef = useRef(`grad-${Math.random().toString(36).substring(2, 9)}`);

  const stops = colors.map((color, index) => {
    let offset = `${(index / Math.max(colors.length - 1, 1)) * 100}%`;
    if (locations && locations[index] !== undefined) {
      offset = `${locations[index] * 100}%`;
    }
    let stopColor = color;
    let stopOpacity = 1;
    if (color === 'transparent') {
      stopColor = '#000000';
      stopOpacity = 0;
    } else if (color.startsWith('rgba(')) {
      const match = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
      if (match) {
        stopColor = `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
        stopOpacity = parseFloat(match[4]);
      }
    }
    return <Stop key={index} offset={offset} stopColor={stopColor} stopOpacity={stopOpacity} />;
  });

  const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI) + 90;
  const colorStops = colors
    .map((color, index) => {
      let offset = `${(index / Math.max(colors.length - 1, 1)) * 100}%`;
      if (locations && locations[index] !== undefined) {
        offset = `${locations[index] * 100}%`;
      }
      return `${color} ${offset}`;
    })
    .join(', ');
  const cssGradient = `linear-gradient(${angle}deg, ${colorStops})`;

  return (
    <View
      style={[
        {
          position: 'relative',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { background: cssGradient, backgroundImage: cssGradient } : {}),
        } as any,
        style,
      ]}
      {...props}
    >
      <Svg
        height="100%"
        width="100%"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <SvgGradient
            id={gradientIdRef.current}
            x1={`${start.x * 100}%`}
            y1={`${start.y * 100}%`}
            x2={`${end.x * 100}%`}
            y2={`${end.y * 100}%`}
          >
            {stops}
          </SvgGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={`url(#${gradientIdRef.current})`}
        />
      </Svg>
      {children}
    </View>
  );
};

export default LinearGradient;

