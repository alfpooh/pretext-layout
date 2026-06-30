/**
 * Minimal, dependency-free Markdown parser tailored to the layout engine.
 *
 * It turns Markdown source into a flat list of "blocks" (headings, paragraphs,
 * list items, blockquotes, horizontal rules). Each block carries inline "runs"
 * (plain / bold / italic / code spans). The flow engine measures and places
 * these runs around image silhouettes using pretext's rich-inline API.
 *
 * Supported syntax (intentionally small):
 *   # / ## / ###        headings
 *   - / * / 1.          list items
 *   >                   blockquote
 *   --- / ***           horizontal rule
 *   **bold**  __bold__  *italic*  _italic_  `code`
 */

export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'quote' | 'hr'

export interface InlineRun {
  text: string
  bold: boolean
  italic: boolean
  code: boolean
}

export interface MarkdownBlock {
  type: BlockType
  runs: InlineRun[]
  /** For list items: the bullet/number prefix to render. */
  marker?: string
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/
const UL_RE = /^[-*+]\s+(.*)$/
const OL_RE = /^(\d+)\.\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/

/** Parse inline emphasis / code spans within a single block of text. */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  // Token regex: code first (so ** inside ` ` is literal), then bold, then italic.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)/g
  let last = 0
  let m: RegExpExecArray | null
  const push = (t: string, bold: boolean, italic: boolean, code: boolean) => {
    if (t.length === 0) return
    runs.push({ text: t, bold, italic, code })
  }
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index), false, false, false)
    if (m[1]) push(m[1].slice(1, -1), false, false, true)
    else if (m[2]) push(m[2].slice(2, -2), true, false, false)
    else if (m[3]) push(m[3].slice(1, -1), false, true, false)
    last = m.index + m[0].length
  }
  if (last < text.length) push(text.slice(last), false, false, false)
  if (runs.length === 0) push(text, false, false, false)
  return runs
}

/** Parse a full Markdown document into a flat list of blocks. */
export function parseMarkdown(src: string): MarkdownBlock[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []

  let paragraph: string[] = []
  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ type: 'p', runs: parseInline(text) })
    paragraph = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushParagraph()
      const level = heading[1]!.length
      const type = (['h1', 'h2', 'h3'] as const)[level - 1]!
      blocks.push({ type, runs: parseInline(heading[2]!.trim()) })
      continue
    }

    if (HR_RE.test(line)) {
      flushParagraph()
      blocks.push({ type: 'hr', runs: [] })
      continue
    }

    const quote = QUOTE_RE.exec(line)
    if (quote) {
      flushParagraph()
      blocks.push({ type: 'quote', runs: parseInline(quote[1]!.trim()) })
      continue
    }

    const ol = OL_RE.exec(line)
    if (ol) {
      flushParagraph()
      blocks.push({ type: 'li', runs: parseInline(ol[2]!.trim()), marker: `${ol[1]}.` })
      continue
    }

    const ul = UL_RE.exec(line)
    if (ul) {
      flushParagraph()
      blocks.push({ type: 'li', runs: parseInline(ul[1]!.trim()), marker: '•' })
      continue
    }

    paragraph.push(line.trim())
  }
  flushParagraph()

  return blocks
}
