import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Bubble } from '../Bubble';
import { BUBBLE, type BubbleKind } from '../theme';

const KINDS = Object.keys(BUBBLE) as BubbleKind[];

test('covers every bubble kind', () => {
  expect(KINDS.sort()).toEqual(['active', 'correct', 'locked', 'passed', 'pending', 'soon', 'wrong']);
});

test.each(KINDS)('%s: a flat disc of its colour, no gradient and no glow', async (kind) => {
  await render(<Bubble testID="b" label="A" kind={kind} size={40} />);
  const st = StyleSheet.flatten(screen.getByTestId('b').props.style);
  expect(st.backgroundColor).toBe(BUBBLE[kind].bg);
  expect(st.backgroundImage).toBeUndefined();
  expect(st.boxShadow).toBeUndefined();
  expect(st.borderWidth).toBe(2);
});

test('the active letter stands apart: a white disc with a dark rim, the others have a light rim', async () => {
  await render(
    <>
      {KINDS.map((k) => <Bubble key={k} testID={k} label="A" kind={k} size={40} />)}
    </>,
  );
  const style = (k: BubbleKind) => StyleSheet.flatten(screen.getByTestId(k).props.style);
  expect(style('active')).toMatchObject({ backgroundColor: '#ffffff', borderColor: '#0a0d1f' });
  for (const k of ['pending', 'correct', 'passed', 'wrong'] as const) {
    expect(style(k).borderColor).toBe('#ffffff');
    expect(style(k).backgroundColor).not.toBe('#ffffff');
  }
});
