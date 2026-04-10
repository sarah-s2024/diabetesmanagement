import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface CardProps {
  children: ReactNode
  title?: string
  className?: string
  glass?: boolean
}

export default function Card({ children, title, className = '', glass }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`bg-surface border border-border rounded-[18px] p-[18px] mb-3 ${glass ? 'backdrop-blur-xl bg-surface/80' : ''} ${className}`}
    >
      {title && (
        <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3.5">
          {title}
        </div>
      )}
      {children}
    </motion.div>
  )
}

export function Badge({ children, color = 'blue' }: { children: ReactNode; color?: 'green' | 'amber' | 'red' | 'blue' }) {
  const colors = {
    green: 'bg-green-dim text-green',
    amber: 'bg-amber-dim text-amber',
    red: 'bg-red-dim text-red',
    blue: 'bg-blue-dim text-blue',
  }
  return (
    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${colors[color]}`}>
      {children}
    </span>
  )
}
