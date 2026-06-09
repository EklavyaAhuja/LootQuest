import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RedditPost } from '../services/redditService';
import { COLORS, getPlatformColor, FONTS } from '../theme/theme';
import BouncyPressable from './BouncyPressable';
import { timeAgo } from '../utils/time';
import { Gamepad2, ArrowRight, Clock } from 'lucide-react-native';

interface CartoonCardProps {
  post: RedditPost;
  onPress: () => void;
}

export default function CartoonCard({ post, onPress }: CartoonCardProps) {
  const platformColor = getPlatformColor(post.platform);

  return (
    <BouncyPressable
      onPress={onPress}
      backgroundColor={platformColor}
      borderRadius={20}
      shadowOffsetSize={6}
      style={styles.cardContainer}
      contentStyle={styles.cardContent}
    >
      <View style={styles.header}>
        {/* Platform Badge */}
        <View style={[styles.badge, styles.platformBadge]}>
          <Gamepad2 size={12} color={COLORS.text} style={styles.iconInline} />
          <Text style={styles.badgeText}>{post.platform}</Text>
        </View>

        {/* Claim Difficulty Badge */}
        <View
          style={[
            styles.badge,
            post.isTask
              ? { backgroundColor: COLORS.warning }
              : { backgroundColor: COLORS.success },
          ]}
        >
          <Text style={styles.badgeText}>
            {post.isTask ? 'Tasks Required' : 'Direct Claim'}
          </Text>
        </View>
      </View>

      {/* Main Title */}
      <Text numberOfLines={2} style={styles.title}>
        {post.cleanTitle}
      </Text>

      {/* Footer Info */}
      <View style={styles.footer}>
        <View style={styles.metaRow}>
          <Clock size={12} color={COLORS.text} style={styles.iconInline} />
          <Text style={styles.footerText}>{timeAgo(post.createdAt)}</Text>
          <Text style={styles.dot}>•</Text>
          <Text numberOfLines={1} style={[styles.footerText, styles.domainText]}>
            {post.domain}
          </Text>
        </View>

        {/* Bouncy action icon */}
        <View style={styles.arrowCircle}>
          <ArrowRight size={16} color={COLORS.white} />
        </View>
      </View>
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  cardContent: {
    padding: 16,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  platformBadge: {
    backgroundColor: COLORS.white,
  },
  badgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.text,
    marginLeft: 3,
    textTransform: 'uppercase',
  },
  iconInline: {
    marginRight: 1,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  footerText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.text,
    opacity: 0.8,
  },
  domainText: {
    maxWidth: 120,
  },
  dot: {
    marginHorizontal: 6,
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.text,
  },
  arrowCircle: {
    backgroundColor: COLORS.text,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
});
