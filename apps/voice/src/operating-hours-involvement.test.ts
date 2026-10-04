import { describe, expect, it } from 'vitest';
import { resolveOperatingHoursInvolvement } from './operating-hours-involvement.js';

describe('operating-hours involvement boundary (Slice 006BD)', () => {
  it('A. pure exact hours request is relevant and exactly answerable', () => {
    expect(resolveOperatingHoursInvolvement('Qual é o horário de atendimento?')).toEqual({
      relevant: true,
      exactlyAnswerable: true,
    });
    expect(resolveOperatingHoursInvolvement('Horário?? De funcionamento!!')).toEqual({
      relevant: true,
      exactlyAnswerable: true,
    });
  });

  it('B. legitimate mixed intent is relevant but not exactly answerable', () => {
    expect(
      resolveOperatingHoursInvolvement(
        'Qual o horário de funcionamento de vocês e qual o melhor horário para ligar sem esperar?',
      ),
    ).toEqual({ relevant: true, exactlyAnswerable: false });
    expect(
      resolveOperatingHoursInvolvement(
        'Até que horas vocês atendem? Preciso remarcar minha consulta.',
      ),
    ).toEqual({ relevant: true, exactlyAnswerable: false });
  });

  it('C. unrelated request is neither relevant nor exactly answerable', () => {
    expect(resolveOperatingHoursInvolvement('Quero cancelar minha conta.')).toEqual({
      relevant: false,
      exactlyAnswerable: false,
    });
    expect(resolveOperatingHoursInvolvement('Vocês têm estacionamento?')).toEqual({
      relevant: false,
      exactlyAnswerable: false,
    });
  });

  it('D. accidental intra-token lookalike is not relevant', () => {
    expect(resolveOperatingHoursInvolvement('Qual o xhorario de funcionamento?')).toEqual({
      relevant: false,
      exactlyAnswerable: false,
    });
  });

  it('E. punctuation-delimited exact phrase stays exactly answerable', () => {
    expect(resolveOperatingHoursInvolvement('Horário de funcionamento...')).toEqual({
      relevant: true,
      exactlyAnswerable: true,
    });
  });

  it('F. prefix/suffix residual text is relevant but not exactly answerable', () => {
    expect(resolveOperatingHoursInvolvement('Por favor, qual o horário de atendimento?')).toEqual({
      relevant: true,
      exactlyAnswerable: false,
    });
    expect(
      resolveOperatingHoursInvolvement('Qual o horário de atendimento de vocês e obrigado'),
    ).toEqual({ relevant: true, exactlyAnswerable: false });
  });

  it('G. negated/meta mention is relevant but never exactly answerable', () => {
    expect(
      resolveOperatingHoursInvolvement(
        'Não perguntei o horário de funcionamento, quero o gerente.',
      ),
    ).toEqual({ relevant: true, exactlyAnswerable: false });
  });

  it('empty or blank input is neither relevant nor exactly answerable', () => {
    expect(resolveOperatingHoursInvolvement('')).toEqual({
      relevant: false,
      exactlyAnswerable: false,
    });
    expect(resolveOperatingHoursInvolvement('   ')).toEqual({
      relevant: false,
      exactlyAnswerable: false,
    });
  });

  it('duplicate canonical phrase with residual text stays mixed', () => {
    expect(
      resolveOperatingHoursInvolvement('Qual o horário? Qual o horário de atendimento hoje?'),
    ).toEqual({ relevant: true, exactlyAnswerable: false });
  });
});
