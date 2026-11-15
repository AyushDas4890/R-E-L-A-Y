// The Relay Bot mascot at rest with one line to say, recurring small on the inner pages. Decorative.
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Robot } from './Robot.tsx';

export function Mascot({ say }: { say: string }) {
  return (
    <VStack hAlign="center" gap={2} className="site-mascot" aria-hidden>
      <Card padding={2} elevation="low" className="site-mascot-say"><Text size="sm" weight="medium">{say}</Text></Card>
      <Robot mood="happy" />
    </VStack>
  );
}
