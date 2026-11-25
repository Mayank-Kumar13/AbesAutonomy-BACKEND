import test from 'node:test';
import assert from 'node:assert';
import { normalizeAdsSettings, updateSettings } from '../controllers/settingsController.js';

test('Settings Google AdSense Configuration', async (suite) => {
  await suite.test('normalizes defaults cleanly when fields are omitted', () => {
    const normalized = normalizeAdsSettings();
    assert.strictEqual(normalized.enabled, true);
    assert.strictEqual(normalized.clientId, 'ca-pub-9991688552602855');
    assert.strictEqual(normalized.leftSlotId, '');
    assert.strictEqual(normalized.rightSlotId, '');
    assert.strictEqual(normalized.mobileSlotId, '');
    assert.strictEqual(normalized.hideForPremium, true);
    assert.strictEqual(normalized.showSetupPlaceholders, false);
  });

  await suite.test('strips whitespace from clientId and slot IDs', () => {
    const normalized = normalizeAdsSettings({
      enabled: false,
      clientId: ' ca-pub-1234567890123456 ',
      leftSlotId: ' 1112223334 ',
      rightSlotId: '5556667778 ',
      mobileSlotId: ' 9990001112',
      hideForPremium: false,
      showSetupPlaceholders: true,
    });
    assert.deepStrictEqual(normalized, {
      enabled: false,
      clientId: 'ca-pub-1234567890123456',
      leftSlotId: '1112223334',
      rightSlotId: '5556667778',
      mobileSlotId: '9990001112',
      hideForPremium: false,
      showSetupPlaceholders: true,
    });
  });

  await suite.test('rejects invalid clientId or non-numeric slotId in updateSettings', async () => {
    const createRes = () => {
      const out = { statusCode: 200, body: null };
      out.status = (code) => {
        out.statusCode = code;
        return out;
      };
      out.json = (payload) => {
        out.body = payload;
        return out;
      };
      return out;
    };

    const badClientRes = createRes();
    await updateSettings(
      { body: { ads: { clientId: 'invalid-client' } } },
      badClientRes,
      (err) => assert.fail(`Unexpected next(err): ${err}`)
    );
    assert.strictEqual(badClientRes.statusCode, 400);
    assert.match(badClientRes.body.message, /ca-pub-/);

    const badSlotRes = createRes();
    await updateSettings(
      { body: { ads: { clientId: 'ca-pub-9991688552602855', leftSlotId: 'abc123' } } },
      badSlotRes,
      (err) => assert.fail(`Unexpected next(err): ${err}`)
    );
    assert.strictEqual(badSlotRes.statusCode, 400);
    assert.match(badSlotRes.body.message, /leftSlotId/);
  });
});
