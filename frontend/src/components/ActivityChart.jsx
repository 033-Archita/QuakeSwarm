import PlotlyChart from './PlotlyChart.jsx'
import { chartColors, plotTheme } from '../plotTheme.js'

function displayedMonthCount(rows) {
  if (rows.length === 0) return 0
  const first = new Date(`${rows[0].period}-01T00:00:00Z`)
  const last = new Date(`${rows[rows.length - 1].period}-01T00:00:00Z`)
  return (last.getUTCFullYear() - first.getUTCFullYear()) * 12
    + last.getUTCMonth() - first.getUTCMonth() + 1
}

export default function ActivityChart({ rows, loading }) {
  if (loading || !rows) return null
  const monthCount = displayedMonthCount(rows)
  const tickSettings = monthCount > 36
    ? { dtick: 'M12', tickformat: '%Y' }
    : monthCount > 12
      ? { dtick: 'M3', tickformat: '%b %Y' }
      : { dtick: 'M1', tickformat: '%b' }

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
        hovertemplate: '%{x|%b %Y}<br>%{y:,} events<extra></extra>',
      }]}
      layout={{
        ...plotTheme,
        height: 245,
        margin: { l: 48, r: 16, t: 8, b: 44 },
        xaxis: { ...plotTheme.xaxis, type: 'date', tickmode: 'linear', ...tickSettings, tickangle: 0, tickfont: { size: 10 }, title: { text: 'Month (UTC)', standoff: 8 } },
        yaxis: { ...plotTheme.yaxis, rangemode: 'tozero', tickformat: ',d', title: { text: 'Events per month', standoff: 8 } },
      }}
      config={{ displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '245px' }}
    />
  )
}
