import Icon from './Icon.jsx';

export default function MasterTable({ rows, columns, onEdit, onDelete, onAdd, addLabel = '+ 追加', onMoveUp, onMoveDown }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>
                {col.label}
              </th>
            ))}
            <th style={{ width: 140 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || idx} style={{ borderBottom: '1px solid var(--line-2)' }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                </td>
              ))}
              <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {onMoveUp && (
                  <button className="btn sm ghost" onClick={() => onMoveUp(idx)} disabled={idx === 0} style={{ padding: '2px 5px', marginRight: 2, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                )}
                {onMoveDown && (
                  <button className="btn sm ghost" onClick={() => onMoveDown(idx)} disabled={idx === rows.length - 1} style={{ padding: '2px 5px', marginRight: 4, opacity: idx === rows.length - 1 ? 0.3 : 1 }}>▼</button>
                )}
                {onEdit && (
                  <button className="btn sm ghost" onClick={() => onEdit(row)} style={{ marginRight: 4 }}>
                    <Icon name="edit" size={12} />
                  </button>
                )}
                {onDelete && (
                  <button className="btn sm ghost" onClick={() => onDelete(row)} style={{ color: 'var(--danger)' }}>
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {onAdd && (
        <button
          className="btn sm ghost"
          onClick={onAdd}
          style={{ width: '100%', borderRadius: 0, borderTop: '1px solid var(--line-2)', padding: '8px', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}
