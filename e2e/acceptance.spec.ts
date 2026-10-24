import { expect, test } from '@playwright/test'

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
