export const MED_DRUGS: Record<string, string[]> = {
  'GLP-1 受体激动剂': [
    '司美格鲁肽 Wegovy（每周注射，减重）',
    '司美格鲁肽 Ozempic / 诺和泰（每周注射，T2DM）',
    '利拉鲁肽 Saxenda（每日注射，减重）',
    '利拉鲁肽 Victoza / 诺和力（每日注射，T2DM）',
    '度拉糖肽 Trulicity（每周注射，T2DM）',
  ],
  'GIP/GLP-1 双重激动剂': [
    '替尔泊肽 Zepbound（每周注射，减重）',
    '替尔泊肽 Mounjaro（每周注射，T2DM）',
  ],
  'SGLT2 抑制剂': [
    '达格列净 Dapagliflozin / 安达唐',
    '恩格列净 Empagliflozin / 欧唐静',
  ],
  '传统经典用药（二甲双胍等）': [
    '二甲双胍 Metformin（每日口服）',
  ],
  '其他': ['其他药物（手动填写剂量栏）'],
}

export const WEEK_PLAN = [
  { dow: 1, name: '周一', type: 'strength' as const, icon: '🏋️', label: '上肢力量训练', duration: 35, intensity: '中等',
    desc: '保护骨密度，增强上肢推拉能力',
    exercises: [
      { name: '热身', detail: '关节绕环 + 轻有氧 · 5分钟', youtube: 'https://www.youtube.com/results?search_query=joint+warm+up+exercise' },
      { name: '哑铃推举', detail: '3×10次', youtube: 'https://www.youtube.com/results?search_query=dumbbell+shoulder+press+tutorial' },
      { name: '弹力带划船', detail: '3×12次', youtube: 'https://www.youtube.com/results?search_query=resistance+band+row+tutorial' },
      { name: '俯卧撑', detail: '膝盖着地可以 · 3×8–10次', youtube: 'https://www.youtube.com/results?search_query=push+up+proper+form+tutorial' },
      { name: '哑铃弯举', detail: '3×10次', youtube: 'https://www.youtube.com/results?search_query=dumbbell+bicep+curl+tutorial' },
      { name: '农夫行走', detail: '3×20米', youtube: 'https://www.youtube.com/results?search_query=farmer+carry+walk+tutorial' },
      { name: '拉伸放松', detail: '5分钟', youtube: 'https://www.youtube.com/results?search_query=upper+body+stretching+cool+down' },
    ] },
  { dow: 2, name: '周二', type: 'cardio' as const, icon: '🚶', label: '快走 / 骑行', duration: 35, intensity: '中低',
    desc: '心率控制 100–115 bpm，目标 6,000–7,000 步',
    exercises: [
      { name: '快走', detail: '30分钟 · 心率100–115 bpm', youtube: 'https://www.youtube.com/results?search_query=brisk+walking+technique+diabetes' },
      { name: '户外骑行（可选）', detail: '20–30分钟', youtube: 'https://www.youtube.com/results?search_query=outdoor+cycling+beginner+tips' },
    ] },
  { dow: 3, name: '周三', type: 'strength' as const, icon: '🏋️', label: '下肢力量训练', duration: 35, intensity: '中等',
    desc: '骨密度关键训练，强化下肢',
    exercises: [
      { name: '热身', detail: '5分钟', youtube: 'https://www.youtube.com/results?search_query=leg+day+warm+up+exercise' },
      { name: '杯状深蹲', detail: '3×10次', youtube: 'https://www.youtube.com/results?search_query=goblet+squat+tutorial+form' },
      { name: '弓步行走', detail: '3×8次/每侧', youtube: 'https://www.youtube.com/results?search_query=walking+lunge+proper+form' },
      { name: '罗马尼亚硬拉', detail: '3×10次', youtube: 'https://www.youtube.com/results?search_query=romanian+deadlift+tutorial+dumbbell' },
      { name: '靠墙静蹲', detail: '3×30秒', youtube: 'https://www.youtube.com/results?search_query=wall+sit+exercise+tutorial' },
      { name: '站立提踵', detail: '3×15次', youtube: 'https://www.youtube.com/results?search_query=standing+calf+raise+tutorial' },
      { name: '拉伸放松', detail: '5分钟', youtube: 'https://www.youtube.com/results?search_query=lower+body+stretching+cool+down' },
    ] },
  { dow: 4, name: '周四', type: 'cardio' as const, icon: '🚶', label: '快走 + 拉伸', duration: 30, intensity: '中低',
    desc: '恢复日，关注灵活性和肌肉放松',
    exercises: [
      { name: '快走', detail: '25–30分钟', youtube: 'https://www.youtube.com/results?search_query=brisk+walking+exercise+tutorial' },
      { name: '全身拉伸', detail: '10分钟', youtube: 'https://www.youtube.com/results?search_query=full+body+stretching+routine+10+minutes' },
      { name: '泡沫轴放松', detail: '针对酸痛部位', youtube: 'https://www.youtube.com/results?search_query=foam+roller+recovery+tutorial' },
    ] },
  { dow: 5, name: '周五', type: 'strength' as const, icon: '🏋️', label: '全身功能训练', duration: 35, intensity: '中等',
    desc: '功能性动作，提升整体运动能力',
    exercises: [
      { name: '壶铃摆荡', detail: '3×12次', youtube: 'https://www.youtube.com/results?search_query=kettlebell+swing+tutorial+beginners' },
      { name: '弹力带训练', detail: '3×10次', youtube: 'https://www.youtube.com/results?search_query=resistance+band+full+body+workout' },
      { name: '平板支撑', detail: '3×20–30秒', youtube: 'https://www.youtube.com/results?search_query=plank+exercise+proper+form' },
      { name: '侧平板', detail: '2×15秒/每侧', youtube: 'https://www.youtube.com/results?search_query=side+plank+tutorial+form' },
      { name: '哑铃负重登阶', detail: '3×8次/每侧', youtube: 'https://www.youtube.com/results?search_query=dumbbell+step+up+exercise+tutorial' },
      { name: '拉伸放松', detail: '5分钟', youtube: 'https://www.youtube.com/results?search_query=full+body+cool+down+stretching' },
    ] },
  { dow: 6, name: '周六', type: 'yoga' as const, icon: '🧘', label: '瑜伽 / 太极 / 散步', duration: 30, intensity: '低',
    desc: '主动恢复，有助于平衡和骨骼健康',
    exercises: [
      { name: '瑜伽', detail: '30分钟', youtube: 'https://www.youtube.com/results?search_query=beginner+yoga+30+minutes' },
      { name: '太极（可选）', detail: '30分钟', youtube: 'https://www.youtube.com/results?search_query=tai+chi+for+beginners+tutorial' },
      { name: '轻松散步（可选）', detail: '20–30分钟', youtube: 'https://www.youtube.com/results?search_query=easy+walking+exercise+routine' },
    ] },
  { dow: 0, name: '周日', type: 'rest' as const, icon: '🛌', label: '完全休息', duration: 0, intensity: '—',
    desc: '充分休息，让肌肉和神经系统恢复',
    exercises: [] },
]
