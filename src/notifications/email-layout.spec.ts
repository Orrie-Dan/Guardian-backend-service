import {
  escapeHtml,
  renderTransactionalEmailHtml,
  renderTransactionalEmailText,
} from './email-layout';

describe('email-layout', () => {
  it('escapes HTML in user content', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('renders multipart-safe text and html bodies', () => {
    const body = {
      greetingName: 'Jean',
      paragraphs: ['Your password was reset.'],
      callouts: [{ label: 'Reason', value: 'Test & demo' }],
    };
    const text = renderTransactionalEmailText(body);
    const html = renderTransactionalEmailHtml('Password reset', body);

    expect(text).toContain('Hello Jean');
    expect(text).toContain('Reason: Test & demo');
    expect(html).toContain('G2 Sentry');
    expect(html).toContain('Hello Jean');
    expect(html).toContain('Test &amp; demo');
    expect(html).not.toContain('<script>');
  });
});
