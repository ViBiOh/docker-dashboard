import React from 'react';
import FaPlay from 'react-icons/lib/fa/play';
import FaStop from 'react-icons/lib/fa/stop';
import FaRefresh from 'react-icons/lib/fa/refresh';
import DockerService from '../Service/DockerService';
import style from './Containers.css';

const GREEN_STATUS = /up/i;

const ContainerRow = ({ container }) => {
  const isUp = GREEN_STATUS.test(container.Status);

  return (
    <span className={style.row}>
      <span className={style.created}>
        {
          typeof container.Created === 'string'
          ? container.Created
          : new Date(container.Created * 1000).toLocaleString()
        }
      </span>
      <span className={style.image}>{container.Image}</span>
      <span className={style.status} style={{ color: isUp ? '#4cae4c' : '#d43f3a' }}>
        {container.Status}
      </span>
      <span className={style.names}>{container.Names.join(', ')}</span>
      {
        DockerService.isLogged() && isUp && [
          <button className={style.icon} onClick={() => DockerService.restart(container.Id)}>
            <FaRefresh />
          </button>,
          <button className={style.icon} onClick={() => DockerService.stop(container.Id)}>
            <FaStop />
          </button>,
        ]
      }
      {
        DockerService.isLogged() && !isUp &&
          <button className={style.icon} onClick={() => DockerService.start(container.Id)}>
            <FaPlay />
          </button>
      }
    </span>
  );
};

ContainerRow.displayName = 'ContainerRow';

ContainerRow.propTypes = {
  container: React.PropTypes.shape({
    Image: React.PropTypes.string.isRequired,
    Created: React.PropTypes.oneOfType([
      React.PropTypes.string,
      React.PropTypes.number,
    ]).isRequired,
    Status: React.PropTypes.string.isRequired,
    Names: React.PropTypes.arrayOf(React.PropTypes.string).isRequired,
  }).isRequired,
};

export default ContainerRow;
