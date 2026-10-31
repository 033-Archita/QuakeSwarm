const colors = {
  graphite: '#3B4548',
  slate: '#526B78',
  orange: '#E58A52',
  red: '#C75B55',
  sage: '#A9C2B4',
  mist: '#DCE9ED',
  grid: 'rgba(59, 69, 72, 0.12)',
}

export const plotTheme = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'IBM Plex Sans, system-ui, sans-serif', color: colors.graphite, size: 12 },
  margin: { l: 42, r: 18, t: 18, b: 38 },
  xaxis: { gridcolor: colors.grid, zerolinecolor: colors.grid, linecolor: colors.grid },
  yaxis: { gridcolor: colors.grid, zerolinecolor: colors.grid, linecolor: colors.grid },
  showlegend: false,
  autosize: true,
}

export const chartColors = colors
