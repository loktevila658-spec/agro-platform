import Link from 'next/link';
import { GisMap } from './gis-map';
import './gis.css';
export default function GisPage() {
  return <main className="gis-workspace" lang="ru">
    <header className="gis-header"><div><h1>Карта</h1><p>Пространственные данные предприятия</p></div><Link href="/">К рабочему месту</Link></header>
    <GisMap />
    <p className="gis-footnote">Подложка не подключена. Базовая карта доступна без внешнего поставщика.</p>
  </main>;
}
