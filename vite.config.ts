import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    allowedHosts: true
  },
  define: {
    'import.meta.env.VITE_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL),
    'import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  }
})
