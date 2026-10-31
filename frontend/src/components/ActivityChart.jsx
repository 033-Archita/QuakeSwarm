import PlotlyChart from './PlotlyChart.jsx'
import { chartColors, plotTheme } from '../plotTheme.js'

export default function ActivityChart({ rows, loading }) {
  if (loading || !rows) return null
  return (
    <PlotlyChart
      data={[{
        type: 'scatter',
        mode: 'lines+markers',
        x: rows.map((row) => row.period),
        y: rows.map((row) => row.count),
        line: { color: chartColors.slate, width: 2.5 },
        marker: { color: chartColors.orange, size: 5, line: { color: '#FFFFFF', width: 1 } },
        fill: 'tozeroy',
        fillcolor: 'rgba(82, 107, 120, 0.12)',
        hovertemplate: '%{x|%B %Y}<br>%{y:,} events<extra></extra>',
      }]}
      layout={{
        ...plotTheme,
        height: 245,
        margin: { l: 48, r: 16, t: 8, b: 44 },
        xaxis: { ...plotTheme.xaxis, type: 'date', dtick: 'M2', tickformat: "%b '%y", tickangle: 0, title: { text: 'Month (UTC)', standoff: 8 } },
        yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', tickformat: ',d', title: { text: 'Events per month', standoff: 8 } },
      }}
      config={{ displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '245px' }}
    />
  )
}
