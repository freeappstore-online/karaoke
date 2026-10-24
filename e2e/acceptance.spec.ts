import { expect, test } from '@playwright/test'

async function mockTabRecording(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    class Recorder {
      static isTypeSupported() {
        return true
      }
      state: RecordingState = 'inactive'
      mimeType = 'audio/wav'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        void fetch('/audio/call-to-the-dawn.wav')
          .then((response) => response.blob())
          .then((data) => {
            this.ondataavailable?.({ data })
            this.onstop?.()
          })
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: Recorder })
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => new AudioContext().createMediaStreamDestination().stream,
    })
  })
}

async function acceptTabRecording(page: import('@playwright/test').Page, name: string) {
  await page.goto('/create')
  await page.getByRole('button', { name: 'Record from browser tab' }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(
    page.getByText('Preview your recording before adding it to this song.'),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'Recording name' }).fill(name)
  await page.getByRole('button', { name: 'Accept recording' }).click()
  await expect(page.getByText(`${name}.wav ·`, { exact: false })).toBeVisible()
}

test('accepted recording survives navigation and reload, resumes, and clears after final save', async ({
  page,
}) => {
  await mockTabRecording(page)
  await acceptTabRecording(page, 'Recover me')
  await page.goto('/')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Unfinished recordings' })).toContainText(
    'Recover me',
  )
  await page.getByRole('button', { name: 'Resume Recover me' }).click()
  await expect(page.getByText('Recover me.wav')).toBeVisible()
  await page.getByRole('combobox', { name: 'Timing method' }).selectOption('lrc')
  await page.getByRole('textbox', { name: 'Timed lyrics' }).fill('[00:00.00]Hello')
  await page.getByRole('button', { name: 'Save & sing' }).click()
  await expect(page.getByRole('region', { name: 'Unfinished recordings' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Unfinished recordings' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Recover me' })).toBeVisible()
})

test('explicit discard removes an accepted recording draft', async ({ page }) => {
  await mockTabRecording(page)
  await acceptTabRecording(page, 'Discard me')
  await page.goto('/')
  await page.reload()
  await page.getByRole('button', { name: 'Resume Discard me' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Discard recording draft' }).click()
  await expect(page.getByRole('region', { name: 'Unfinished recordings' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Unfinished recordings' })).toHaveCount(0)
})

test('storage quota failure keeps the recording preview and explains the risk', async ({
  page,
}) => {
  await mockTabRecording(page)
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    Object.defineProperty(IDBObjectStore.prototype, 'put', {
      value: function (this: IDBObjectStore, value: unknown) {
        if (this.name === 'drafts') throw new DOMException('Storage full', 'QuotaExceededError')
        return put.call(this, value)
      },
    })
  })
  await page.goto('/create')
  await page.getByRole('button', { name: 'Record from browser tab' }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(
    page.getByText('Preview your recording before adding it to this song.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Accept recording' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save the recording draft')
  await expect(
    page.getByText('Preview your recording before adding it to this song.'),
  ).toBeVisible()
})

test('full screen control enters and exits the lyric stage', async ({ page }) => {
  await page.goto('/')
  const stage = page.getByRole('region', { name: 'Karaoke lyrics' })
  await stage.getByRole('button', { name: 'Full screen' }).click()
  await expect(stage).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-label')))
    .toBe('Karaoke lyrics')
  await stage.getByRole('button', { name: 'Full screen' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()
})

test('keyboard operates playback and lyric navigation controls', async ({ page }) => {
  await page.goto('/')
  const play = page.getByRole('button', { name: '▶ Play song' })
  await expect(play).toBeEnabled()
  await play.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Ⅱ Pause' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(play).toBeVisible()

  const lyrics = page.getByText('All lyrics · choose a line to jump')
  await lyrics.focus()
  await page.keyboard.press('Enter')
  const line = page.locator('.lyrics-list button').nth(2)
  await line.focus()
  await page.keyboard.press('Enter')
  const position = page.getByRole('slider', { name: 'Song position' })
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0)
  const before = Number(await position.inputValue())
  await position.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(before)
})

test('reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Full screen' })
  await expect(button).toBeVisible()
  expect(await button.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    '0s',
  )
})

test('theme toggle applies dark and light document themes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Theme: system' }).click()
  await expect(page.getByRole('button', { name: 'Theme: light' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Theme: light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Theme: dark' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
})

test('song editor fits a 320px mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/create')
  await expect(page.getByRole('heading', { name: 'Make a sing-along' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
