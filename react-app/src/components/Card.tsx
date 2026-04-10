import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface CardProps {
  children: ReactNode
  title?: string
  className?: string
}

export default function Card({ children, title, className = '' }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`bg-surface border border-border rounded-2xl p-5 mb-3 ${className}`}
    >
      {title && (
        <div className="text-[11px] font-medium text-muted uppercase tracking-[0.08em] mb-4">
          {title}
        </div>
      )}
      {children}
    </motion.div>
  )
}

export function Badge({ children, color = 'blue' }: { children: ReactNode; color?: 'green' | 'amber' | 'red' | 'blue' | 'gold' }) {
  const colors = {
    green: 'bg-green-dim text-green',
    amber: 'bg-amber-dim text-amber',
    red: 'bg-red-dim text-red',
    blue: 'bg-blue-dim text-blue',
    gold: 'bg-gold-dim text-gold',
  }
  return (
    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${colors[color]}`}>
      {children}
    </span>
  )
}
