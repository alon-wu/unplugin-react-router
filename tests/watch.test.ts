import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watch } from 'chokidar'
import { attachPageWatcher, isPageFile } from '../src/core/watch'
import type { RoutesFolderOptionResolved } from '../src/options'

function makeFolder(): { folder: RoutesFolderOptionResolved; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'urr-watch-'))
  mkdirSync(join(dir, 'pages'))
  const folder: RoutesFolderOptionResolved = {
    src: join(dir, 'pages'),
    path: '',
    extensions: ['.tsx', '.jsx'],
    exclude: [],
  }
  return { folder, dir }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('attachPageWatcher', () => {
  it('triggers onChanged when a page file is added or removed', async () => {
    const { folder, dir } = makeFolder()
    let calls = 0
    const fsWatcher = watch(folder.src, { ignoreInitial: true })
    const attached = attachPageWatcher({
      watcher: fsWatcher,
      folders: [folder],
      onChanged: () => {
        calls++
      },
    })
    try {
      await sleep(200)
      writeFileSync(join(folder.src, 'x.tsx'), '')
      await sleep(500)
      expect(calls).toBeGreaterThanOrEqual(1)
      const before = calls
      rmSync(join(folder.src, 'x.tsx'))
      await sleep(500)
      expect(calls).toBeGreaterThan(before)
    } finally {
      attached.detach()
      await fsWatcher.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignores non-page files and excluded files', async () => {
    const { folder, dir } = makeFolder()
    folder.exclude = ['**/ignored/**']
    mkdirSync(join(folder.src, 'ignored'))
    let calls = 0
    const fsWatcher = watch(folder.src, { ignoreInitial: true })
    attachPageWatcher({
      watcher: fsWatcher,
      folders: [folder],
      onChanged: () => {
        calls++
      },
    })
    try {
      await sleep(200)
      writeFileSync(join(folder.src, 'notes.txt'), '')
      writeFileSync(join(folder.src, 'ignored', 'x.tsx'), '')
      await sleep(500)
      expect(calls).toBe(0)
      // not excluded anymore once folder.exclude is empty at match time:
      expect(isPageFile([{ ...folder, exclude: [] }], join(folder.src, 'ignored', 'x.tsx'))).toBe(true)
    } finally {
      await fsWatcher.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops notifying after detach', async () => {
    const { folder, dir } = makeFolder()
    let calls = 0
    const fsWatcher = watch(folder.src, { ignoreInitial: true })
    const attached = attachPageWatcher({
      watcher: fsWatcher,
      folders: [folder],
      onChanged: () => {
        calls++
      },
    })
    try {
      await sleep(200)
      attached.detach()
      writeFileSync(join(folder.src, 'y.tsx'), '')
      await sleep(400)
      expect(calls).toBe(0)
    } finally {
      await fsWatcher.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
