import { StyleSheet, View } from 'react-native';

import { Screen } from '../../components/screen';
import { AppText } from '../../components/ui/primitives';
import { space, usePalette } from '../../theme';
import type { LegalBlock, LegalDocument } from './documents';

/**
 * Renders a legal document as readable text: real headings for screen-reader
 * navigation, a comfortable line length, and plain bullets. Shared by the app
 * and the public web pages the app stores link to.
 */
export function LegalDocumentScreen({ document }: { document: LegalDocument }) {
  return (
    <Screen insetTop={false}>
      <View style={styles.intro}>
        <View accessibilityRole="header">
          <AppText variant="title">{document.title}</AppText>
        </View>
        <AppText tone="muted">{document.summary}</AppText>
        <AppText variant="caption" tone="faint">
          Last updated {document.lastUpdated}
        </AppText>
      </View>
      {document.sections.map((section) => (
        <View key={section.id} style={styles.section} nativeID={section.id}>
          <View accessibilityRole="header">
            <AppText variant="heading">{section.heading}</AppText>
          </View>
          {section.blocks.map((block, index) => (
            <LegalBlockView key={index} block={block} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

/** One paragraph or bulleted list from a legal document. */
export function LegalBlockView({ block }: { block: LegalBlock }) {
  const colors = usePalette();
  if (block.kind === 'paragraph') return <AppText style={styles.text}>{block.text}</AppText>;
  return (
    <View style={styles.list}>
      {block.items.map((item) => (
        <View key={item} style={styles.item}>
          <View style={[styles.bullet, { backgroundColor: colors.textMuted }]} />
          <AppText style={[styles.text, { flex: 1 }]}>{item}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm, paddingBottom: space.md },
  section: { gap: space.sm, paddingTop: space.md },
  text: { lineHeight: 23 },
  list: { gap: space.sm },
  item: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 9 },
});
