import Icon from './Icon.jsx';
import HaloLogo from './HaloLogo.jsx';

export default function SideNav() {
  return (
    <nav className="sidenav">
      <div className="logo">
        <HaloLogo size={26} withWord={false} />
      </div>
      <div className="spacer" />
      <div className="nav-item">
        <Icon name="settings" size={18} />
        <span className="tip">設定</span>
      </div>
      <div className="nav-item">
        <Icon name="bell" size={18} />
        <span className="tip">通知</span>
      </div>
    </nav>
  );
}
