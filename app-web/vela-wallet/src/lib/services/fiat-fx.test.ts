/** The endpoint shapes `normalizeRates` accepts (provider-swappable), and what it refuses. */
import { describe, expect, it } from 'vitest';
import { normalizeRates } from './fiat-fx';

describe('normalizeRates', () => {
	it('Frankfurter v2 arrays and {rates} objects both become USD-based maps', () => {
		expect(
			normalizeRates([
				{ base: 'USD', quote: 'eur', rate: 0.92 },
				{ base: 'USD', quote: 'VND', rate: '25000' },
				{ base: 'USD', quote: 'BAD', rate: -1 }
			])
		).toEqual({ USD: 1, EUR: 0.92, VND: 25000 });
		expect(normalizeRates({ rates: { gbp: 0.78, ZERO: 0, NAN: 'x' } })).toEqual({
			USD: 1,
			GBP: 0.78
		});
	});
	it('a response with no usable rate is null, not a USD-only map', () => {
		expect(normalizeRates([])).toBeNull();
		expect(normalizeRates({ rates: {} })).toBeNull();
		expect(normalizeRates('junk')).toBeNull();
		expect(normalizeRates(null)).toBeNull();
	});
});
