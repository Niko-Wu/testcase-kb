import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import CaseTable from './CaseTable.vue'
import RunSummary from './RunSummary.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CaseTable', CaseTable)
    app.component('RunSummary', RunSummary)
  },
} satisfies Theme
