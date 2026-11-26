import { describe, expect, it } from 'vitest';
import { classifyLeadReply } from './lead-reply-intent.js';

const kinds = (texts: readonly string[]) => texts.map((text) => classifyLeadReply(text).kind);

describe('E2 PR1 — conservative pt-BR lead reply classification', () => {
  it('recognizes only unequivocal opt-out requests', () => {
    expect(
      kinds([
        'Não me liguem mais',
        'para de me ligar, por favor',
        'Tira meu número da lista',
        'quero que remova meu telefone',
        'Não quero mais receber ligações',
        'me descadastra',
        'me tira da sua lista',
      ]),
    ).toEqual(Array(7).fill('OPT_OUT'));
  });

  it('a negated or partial request is NOT an opt-out (asks to clarify instead)', () => {
    expect(kinds(['não precisa tirar meu número', 'não me ligue amanhã, liga depois'])).toEqual([
      'AMBIGUOUS',
      'AMBIGUOUS',
    ]);
  });

  it('opt-out wins over any other content in the same utterance', () => {
    expect(classifyLeadReply('sim, pode marcar, mas depois não me liguem mais').kind).toBe(
      'OPT_OUT',
    );
  });

  it('accepts affirmation, negation and selection only as whole known forms', () => {
    expect(kinds(['Sim!', 'pode marcar', 'Isso mesmo.', 'não', 'nenhum desses'])).toEqual([
      'AFFIRM',
      'AFFIRM',
      'AFFIRM',
      'NEGATE',
      'NEGATE',
    ]);
    expect(
      ['a primeira', 'quero a segunda opção', 'opção 3', 'pode ser a terceira', '2'].map((text) =>
        classifyLeadReply(text),
      ),
    ).toEqual([1, 2, 3, 3, 2].map((ordinal) => ({ kind: 'SELECT', ordinal })));
  });

  it('anything mixed or unknown is AMBIGUOUS; time changes are recognized; empty is SILENCE', () => {
    expect(
      kinds([
        'sim, mas na segunda',
        'acho que sim',
        'a quarta',
        'tem outro horário?',
        '',
        '  ...  ',
      ]),
    ).toEqual(['AMBIGUOUS', 'AMBIGUOUS', 'AMBIGUOUS', 'TIME_CHANGE', 'SILENCE', 'SILENCE']);
  });
});
