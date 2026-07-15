import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Arabic application shell', () => {
  it('renders the online core action and computer fallback in RTL', () => {
    const html = renderToString(<App />)
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('لعبة جديدة أونلاين')
    expect(html).toContain('تجربة ضد الكمبيوتر')
  })
})
