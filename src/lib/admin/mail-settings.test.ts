import { describe, expect, test } from 'vitest';
import { appUrlNotices, looksLikeEmail, parseMailPort } from './mail-settings';

const RESET = 'https://admin.aguja.example/restablecer';

describe('looksLikeEmail', () => {
	test('forma de email con espacios alrededor', () => {
		expect(looksLikeEmail(' web@aguja.example ')).toBe(true);
		expect(looksLikeEmail('web@aguja')).toBe(false);
		expect(looksLikeEmail('')).toBe(false);
	});
});

describe('parseMailPort', () => {
	test.each([
		['587', 587],
		[' 465 ', 465],
		['1', 1],
		['65535', 65535]
	])('«%s» es el puerto %i', (text, port) => {
		expect(parseMailPort(text)).toBe(port);
	});

	test.each(['', '0', '65536', '-1', '58.7', 'abc', '5 87'])('«%s» no es un puerto', (text) => {
		expect(parseMailPort(text)).toBeNull();
	});
});

describe('appUrlNotices', () => {
	test('B2.1: coincide y es https, sin avisos', () => {
		expect(appUrlNotices('https://admin.aguja.example', RESET)).toEqual({
			invalid: false,
			http: false,
			mismatch: false
		});
	});

	test('B2.2: otro origen avisa de que no coincide', () => {
		expect(appUrlNotices('https://aguja.example', RESET)).toEqual({
			invalid: false,
			http: false,
			mismatch: true
		});
	});

	test('B2.3: http en el mismo origen avisa solo de http, no de «no coincide»', () => {
		expect(
			appUrlNotices('http://admin.aguja.example', 'http://admin.aguja.example/restablecer')
		).toEqual({ invalid: false, http: true, mismatch: false });
	});

	test('B2.3: http que además no coincide lleva los dos avisos', () => {
		expect(appUrlNotices('http://otra.aguja.example', RESET)).toEqual({
			invalid: false,
			http: true,
			mismatch: true
		});
	});

	test('http en localhost no avisa de http y, si coincide, nada más', () => {
		expect(appUrlNotices('http://localhost:8090', 'http://localhost:8090/restablecer')).toEqual({
			invalid: false,
			http: false,
			mismatch: false
		});
	});

	test('B2.4: sin esquema, vacía u otro esquema BLOQUEAN y no llevan más avisos', () => {
		for (const value of ['admin.aguja.example', '', 'ftp://x.example', 'localhost:8090']) {
			expect(appUrlNotices(value, RESET)).toEqual({ invalid: true, http: false, mismatch: false });
		}
	});

	test('una barra final o una ruta no cambian el origen', () => {
		expect(appUrlNotices('https://admin.aguja.example/', RESET).mismatch).toBe(false);
		expect(appUrlNotices('https://admin.aguja.example/panel', RESET).mismatch).toBe(false);
	});
});
