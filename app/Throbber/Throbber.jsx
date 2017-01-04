import React from 'react';
import style from './Throbber.css';

const Throbber = ({ label, white }) => (
  <div className={style.throbberContainer}>
    {label && <span>{label}</span>}
    <div className={`${style.throbber} ${white ? style.white : ''}`}>
      <div className={style.bounce1} />
      <div className={style.bounce2} />
      <div className={style.bounce3} />
    </div>
  </div>
);

Throbber.propTypes = {
  label: React.PropTypes.string,
  white: React.PropTypes.bool,
};

Throbber.displayname = 'Throbber';

export default Throbber;
