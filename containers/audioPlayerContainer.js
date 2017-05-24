import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  Slider,
  Image,
  View,
  TouchableOpacity,
  Dimensions,
  Platform
} from 'react-native';
import THEME from '../styles/variables';
import { ReactNativeAudioStreaming, Player, ReactNativeStreamingPlayer} from 'react-native-audio-streaming';
import SongPickerContainer from './songPickerContainer';
import CurrentPlaylistContainer from './currentPlaylistContainer';
import {
  setPlaylist,
  addPlaylistItem,
  incrementCurrentPlayIndex,
  decrementCurrentPlayIndex,
  changeCurrentPlayIndex
} from '../redux/actions/currentPlaylistActions';
import {
  pushNotification
} from '../redux/actions/notificationActions';
import { connect } from 'react-redux';
import MultiSlider from 'react-native-multi-slider';
import throttle from 'lodash.throttle';
import LogSlider from '../helpers/LogSlider';

const PROGRESS_TICK_INTERVAL = 1000;
const capitalize = (str) => str[0].toUpperCase() + str.substring(1).toLowerCase();
const PLAYBACK_ENABLED_STATES = {PLAYING:1,BUFFERING:1};
const PLAYBACK_DISABLED_STATES = {STOPPED:1,PAUSED:1};
class AudioPlayerContainer extends Component {
  constructor(props){
    super(props);
    this._onPlayToggleOnePress = this._onPlayToggleOnePress.bind(this);
    this._onPickerToggle = this._onPickerToggle.bind(this);
    this._onSongSelected = this._onSongSelected.bind(this);
    this._onVolumeValueChange = this._onVolumeValueChange.bind(this);
    this._onMultiSliderValuesChange = this._onMultiSliderValuesChange.bind(this);
    this._onSeekToTime = this._onSeekToTime.bind(this);
    this._onSeekToTimeStart = this._onSeekToTimeStart.bind(this);
    this._onProgressTick = this._onProgressTick.bind(this);
    this._goToNextTrack = this._goToNextTrack.bind(this);
    this._goToPrevTrack = this._goToPrevTrack.bind(this);
    this._toggleCurrentPlaylist = this._toggleCurrentPlaylist.bind(this);
    this._onPlayerStoppedDebounced = throttle(this._onPlayerStoppedDebounced.bind(this),500,{trailing:false});
    this._onAudioRouteInterruption = this._onAudioRouteInterruption.bind(this);
    this._onRemoteControlEvent = this._onRemoteControlEvent.bind(this);
    this.playerAObj = new ReactNativeStreamingPlayer();

    this.state = {
      volume:1,
      userVolume:1,
      elapsed:0,
      duration:0,
      status:false,
      initialSliderValue:1,
      sliderOneValue:[1],
      pan : this.props.pan,
      muted : this.props.muted,
      prevRemoteStatus : false,
      playbackIndex : 0
    };
    this.volumeSliderScale = LogSlider({maxpos: 100, minval: 0, maxval: 100})
    this.playerAObj.setPan(this.state.pan);
    this.playerAObj.setVolume(this._linearToLogVolume(this.state.volume));
    this._onProgressTick();
    console.log('platform ', Platform)
    this.playerAObj.on('stateChange',(evt) => {
      const actionName = evt.status.toLowerCase(),
        hookName = '_onPlayer'+capitalize(actionName);
      if(typeof this[hookName] === 'function' ){
        this[hookName](...[evt]);
      }
    });
    this.playerAObj.on('AudioRouteInterruptionEvent',(evt) => {
      this._onAudioRouteInterruption(evt);
    });
    this.playerAObj.on('RemoteControlEvents',this._onRemoteControlEvent);
  }
  _updateComponentPlayerState(){
    this.playerAObj.getStatus((err,data) => {
      let currPlaybackProgress = parseInt( (data.progress * 100) / data.duration ) || 0;
      this.setState({
          duration : data.duration,
          elapsed: data.progress,
          sliderOneValue:[currPlaybackProgress],
          status : data.status
        });
    });
  }
  _onProgressTick(){
    this._updateComponentPlayerState();

    this.playbackProgressRef = setTimeout(
      this._onProgressTick,PROGRESS_TICK_INTERVAL
    );
  }
  _clearProgressTick(){
    if(this.playbackProgressRef){
      clearTimeout(this.playbackProgressRef);
    }
  }
  _onPlayerStopped(evt){
    this._onPlayerStoppedDebounced(evt);
  }
  _onPlayerStoppedDebounced(evt){
    console.log('_onPlayerStopped Debounced',evt);
    if(evt.progress == 0 && evt.duration == 0 && evt.prevStatus in {'PLAYING':1,'BUFFERING':1}){
         console.log('track end detected. go to next track');
         this._goToNextTrack();
       }
  }
  _onAudioRouteInterruption(evt){
    console.log('onAudioRouteInterruption',evt);
    if(evt.reason === 'AVAudioSessionRouteChangeReasonOldDeviceUnavailable'){
      this.playerAObj.isPlaying((err,isPlaying) => {
        if(isPlaying) this.playerAObj.pause();
      });
    }
  }
  _onRemoteControlEvent(evt){
    console.log('onRemoteControlEvent',evt);
    let exclusiveCommandMap = {
      'nextTrackCommand' : this._goToNextTrack,
      'prevTrackCommand' : this._goToPrevTrack,
      'togglePlayPauseCommand' : this._onPlayToggleOnePress
    };

    if(this._isCurrentExclusiveSide()){
       (evt.type in exclusiveCommandMap) ? exclusiveCommandMap[evt.type]() : null;
    }
    if(evt.type === 'pauseCommand'){
        this.playerAObj.getStatus((err,data) => {
          if(!(data.status in PLAYBACK_ENABLED_STATES)) return false;
          this.playerAObj.pause();
          this.setState({prevRemoteStatus : data.status});
        });
    }
    if(evt.type === 'playCommand'){
      this.playerAObj.getStatus((err,data) => {
        if(!(data.status in PLAYBACK_DISABLED_STATES) ||
           !(this.state.prevRemoteStatus in PLAYBACK_ENABLED_STATES)){
            return false;
          }
          data.status === 'PAUSED' ? this.playerAObj.resume() : this.playerAObj.play();
      });
    }
  }
  _onSongSelected(nextTrack){
    this._resolvePlayableSoundUrl(nextTrack).then((nextTrack) => {
      this.props.onSongQueued(nextTrack);
      this._goToTrack(nextTrack);
    });
  }
  _onSongQueued(nextTrack){
    this.props.pushNotification({
      type : 'success',
      message : 'Added Track!'
    });
    this._resolvePlayableSoundUrl(nextTrack).then((nextTrack) => {
      this.props.onSongQueued(nextTrack);
    });
  }
  _goToNextTrack(){
    this.props.goToNextTrack();
  }
  _goToPrevTrack(){
    this.props.goToPrevTrack();
  }
  _goToTrack(track){
    console.log('goToTrack', this.props.playlist.tracks)
    this.props.goToTrack(track);
  }
  _prepareCurrentTrack(shouldAutoPlay){
    let currentTrack = this._getCurrentTrackStream();
    console.log('_prepareCurrentTrack',currentTrack,'and play');
    if( !currentTrack )return;
    this.playerAObj.isPlaying((err,isPlaying) => {
      if(isPlaying) {
        console.log('pause and set url to next')
        this.playerAObj.pause();
      }
      console.log('setSoundUrl');
      this.playerAObj.setSoundUrl(currentTrack);
      if( shouldAutoPlay ){
        console.log('start playback');
        this.playerAObj.play();
      }
    });
  }
  _resolvePlayableSoundUrl(songObj){
    let stripSSL = (s) => s ? s.replace(/^(https)/,'http') : s ;
    //this strip of https is needed as the ATS excaption for tls version on
    //the info.plist wont work on twice for same request and 302 redirect
    //to a second exceptional domain
    songObj.streamUrl = stripSSL(songObj.streamUrl);
    songObj.artwork = stripSSL(songObj.artwork);
    return Promise.resolve(songObj);
  }
  _onPlayToggleOnePress(){
      if(this._isCurrentMutedSide()){
        console.log('toggle playback attempted on muted player');
        return false;
      }
      console.log('_onPlayToggle checks passed');
      this.playerAObj.getStatus((err,playbackStatus) => {
        if(playbackStatus.status === "PLAYING"){
          this.playerAObj.pause();
        }
        if(playbackStatus.status === "PAUSED" ){
          this.playerAObj.resume()
        }
        if(playbackStatus.status === "STOPPED"){
          this.playerAObj.play();
        }
        this._updateComponentPlayerState();
      });
  }
  _onPickerToggle(){
    this.props.navigator.push({
      component: SongPickerContainer,
      passProps : {
        side : this.props.side,
        onClose: () => { this.props.navigator.pop() },
        onSongSelected : (nextTrack) => {
          this._onSongSelected(nextTrack);
        },
        onSongQueued : (nextTrack) => {
          this._onSongQueued(nextTrack);
        }
      }
    });
  }
  _toggleCurrentPlaylist(){
    this.props.navigator.push({
      component: CurrentPlaylistContainer,
      passProps : {
        side : this.props.side,
        playlist : this.props.playlist,
        playlistTitle : `Currently Playing / ${this.props.side == 'L' ? 'Top' : 'Bottom'} Player`,
        onClose: () => { this.props.navigator.pop() },
        onTrackSelected : (nextTrack) => {
          this._goToTrack(nextTrack);
        }
      }
    });
  }
  _onMultiSliderValuesChange(values){
    console.log('_onMultiSliderValuesChange')
  }
  _onSeekToTime(newPos){
    let seekedPos = (parseInt(newPos[0]) * this.state.duration) / 100;
    this.playerAObj.seekToTime(seekedPos);
    this._onProgressTick();
  }
  _onSeekToTimeStart(){
    this._clearProgressTick();
  }
  _onVolumeValueChange(value) {
    const volume = this._linearToLogVolume(value);
    console.log('increment volume : slider',value,'volume', volume);
    this.setState({
      volume: volume,
      userVolume: volume
    });
  }
  _linearToLogVolume(currVolumePosition){
    currVolumePosition = parseInt(currVolumePosition * 100);
    if(currVolumePosition == 0 || currVolumePosition == 100){
      return currVolumePosition / 100;
    }
    return parseFloat((this.volumeSliderScale.value(currVolumePosition)/100).toFixed(2));
  }
  _onPlayerMuteChange(muted){
    if(muted){
      this.playerAObj.setVolume(this._linearToLogVolume(0));
      this.playerAObj.isPlaying((isPlaying) => {
        if(isPlaying) this.playerAObj.pause();
      });
      this.setState({muted:true});
    } else {
      this.setState({muted:false});
      this.playerAObj.setVolume(this._linearToLogVolume(this.state.userVolume));
    }
  }
  _formatAsMinutes(seconds){
    let min = Math.floor(seconds / 60),
      leftSeconds = seconds - (min * 60),
      pInt = (float) => parseInt(float,10),
      pad = (int) => int < 10 ? `0${pInt(int)}` : `${pInt(int)}`;
    return `${pad(min)}:${pad(leftSeconds)}`;
  }
  componentWillReceiveProps(newProps){
    if(newProps.pan != this.props.pan ||
       newProps.muted != this.props.muted){
         this.setState({
           pan:newProps.pan,
           muted:newProps.muted
         });
    }
    if(newProps.playlist.currentTrackIndex != this.props.playlist.currentTrackIndex){
      this.setState({playbackIndex : newProps.playlist.currentTrackIndex})
    }
    if(newProps.playlist.tracks !== this.props.playlist.tracks){
      console.log('(props Update) playlist updated:',newProps.playlist);
    }
  }
  componentDidUpdate(prevProps, prevState){
    if(prevState.volume !== this.state.volume && !this.state.muted){
      this.playerAObj.setVolume(this.state.volume);
    }
    if(prevState.pan !== this.state.pan){
      this.playerAObj.setPan(this.state.pan);
    }
    if(prevState.muted !== this.state.muted){
      this._onPlayerMuteChange(this.state.muted);
    }
    if(prevProps.playlist.tracks[prevState.playbackIndex] !==
       this.props.playlist.tracks[this.state.playbackIndex]){
       console.log(
         '(state Update) current playing track changed: prepare to play. idx:',
         this.state.playbackIndex
       );
       let shouldAutoPlay = !this.props.playlist.rehydrate;
       this._prepareCurrentTrack(shouldAutoPlay);
    }

  }
  componentWillUnmount(){
    console.log("component will unmount! destory player instance")
    if(this.playerAObj){
       this.playerAObj.stop();
       this.playerAObj.destroy();
    }
  }
  _getCurrentTrackIndex(){
    return this.state.playbackIndex;
  }
  _getCurrentTrackObj(){
    return this.props.playlist.tracks[this.state.playbackIndex] || {};
  }
  _getCurrentTrackStream(){
    return this._getCurrentTrackObj().streamUrl;
  }
  _getCurrentTrackTitle() {
    return this._getCurrentTrackObj().label;
  }
  _getCurrentTrackArtwork(){
    const scArtwork = this._getCurrentTrackObj().artwork ?
      this._getCurrentTrackObj().artwork.replace('-large', '-t500x500') : null;
    return scArtwork || false;
  }
  _isPlayerBuffering(){
    return this.state.status === 'BUFFERING';
  }
  _isPlayerPlaying(){
    return this.state.status === 'PLAYING';
  }
  _isPlayerPaused(){
    return this.state.status === 'PAUSED';
  }
  _isPlayerStopped(){
    return this.state.status === 'STOPPED';
  }
  _isCurrentExclusiveSide(){
    return this.state.pan === 0 && this.state.muted === 0;
  }
  _isCurrentMutedSide(){
    return this.state.muted === 1;
  }
  render() {
    const sideLabel = {
      'L' : 'left',
      'R' : 'right'
    };
    const isBufferingLabel = 'Buffering - ';
    let playbackSource = this._isPlayerPlaying() || this._isPlayerBuffering() ?
      require('../assets/flat_pause.png') : require('../assets/flat_play.png');
    let {height, width} = Dimensions.get('window');
    let progressTrackLength = width - 140;
    let trackIndex = this._getCurrentTrackIndex();
    let trackLabelPlaceholder = 'Tap to load ' + sideLabel[this.props.side] + ' track...';
    let isPlaylistVisible = this.props.playlist.tracks.length > 1;
    if( this._getCurrentTrackTitle() ){
        trackLabelPlaceholder = this._getCurrentTrackTitle();
    }
    if( this._isPlayerBuffering() ){
      trackLabelPlaceholder = `${isBufferingLabel} ${trackLabelPlaceholder}`;
    }
    return (
      <View style={styles.mainContainer} >
        <View style={styles.artwork}>
            <Image
              style={[styles.artworkImage]}
              source={ this._getCurrentTrackArtwork() ?
                 {uri:this._getCurrentTrackArtwork()} :
                 require('../assets/alt_artwork.png')
               }
              resizeMode={this._getCurrentTrackArtwork() ?'cover':'stretch'}>

              <View style={styles.tracknameContainer}>
                <TouchableOpacity  onPress={this._onPickerToggle}>
                  <Text style={styles.trackname} numberOfLines={1} ellipsizeMode={'tail'}>
                    { trackLabelPlaceholder }
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.horizontalContainer} >
                <Text style={[styles.playbackTime,styles.playbackTimeInitial]}>{this._formatAsMinutes(this.state.elapsed)}</Text>
                <View style={styles.playbackTrackContainer}>
                  <MultiSlider
                    values={this.state.sliderOneValue}
                    min={0}
                    max={100}
                    onValuesChange={this._onMultiSliderValuesChange}
                    onValuesChangeFinish={this._onSeekToTime}
                    onValuesChangeStart={this._onSeekToTimeStart}
                    sliderLength={progressTrackLength}
                    trackStyle={{ borderRadius: 12, height: 3 }}
                    selectedStyle={{backgroundColor: 'rgb(255,255,255)'}}
                    unselectedStyle={{backgroundColor: 'rgba(255,255,255,0.3)'}}
                    markerStyle={markerStyle} />
                </View>
                <Text style={styles.playbackTime}>{this._formatAsMinutes(this.state.duration)}</Text>
              </View>
              <View style={styles.horizontalContainer}>
                <TouchableOpacity style={[styles.container,styles.startRow]} onPress={this._goToPrevTrack}>
                  <Image style={[styles.playerIcon]} source={require('../assets/flat_prev.png')} resizeMode={'cover'}/>
                </TouchableOpacity>
                <TouchableOpacity style={styles.container} onPress={this._onPlayToggleOnePress}>
                  <Image
                     style={[styles.playerIcon,styles.playerIconSmaller]}
                     source={playbackSource}
                     resizeMode={'contain'}/>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.container,styles.endRow]} onPress={this._goToNextTrack}>
                  <Image style={[styles.playerIcon]} source={require('../assets/flat_next.png')} resizeMode={'cover'}/>
                </TouchableOpacity>
              </View>
              {isPlaylistVisible ? <View style={styles.playlistButtonView}>
                <TouchableOpacity style={styles.playlistButton} onPress={this._toggleCurrentPlaylist}>
                  <Image
                    style={[styles.playerIcon,styles.playerIconSuperSmall]}
                    source={require('../assets/flat_select.png')}
                    resizeMode={'contain'}
                    />
                </TouchableOpacity>
              </View> : null}
              <View style={styles.horizontalContainer}>
                <View style={styles.volumeSlider}>
                  <Slider step={0.05}
                    minimumTrackTintColor={sliderTrackStyles.min}
                    maximumTrackTintColor={sliderTrackStyles.max}
                    onValueChange={this._onVolumeValueChange}
                    value={this.state.initialSliderValue} />
                </View>
              </View>
            </Image>
        </View>
      </View>
    );
  }
}

AudioPlayerContainer.propTypes = {

};
const mapStateToProps = (state, props) => {
  let player = state.players.filter((player) => player.side === props.side).pop();
  let playlist = state.playlist.filter((playlist) => playlist.side === props.side).pop();
  return {
    player,
    pan : player.pan,
    muted : player.muted,
    playlist
  }
};
const mapDispatchToProps = (dispatch, props) => {
  return {
    onSongSelected : (trackItem) => dispatch(setPlaylist(props.side,[trackItem])),
    onSongQueued : (trackItem) => dispatch(addPlaylistItem(props.side,trackItem)),
    goToNextTrack: () => dispatch(incrementCurrentPlayIndex(props.side)),
    goToPrevTrack: () => dispatch(decrementCurrentPlayIndex(props.side)),
    goToTrack: (trackItem) => dispatch(changeCurrentPlayIndex(props.side,trackItem)),
    pushNotification: (notification) => dispatch(pushNotification(notification))
  };
};
AudioPlayerContainer = connect(mapStateToProps,mapDispatchToProps)(AudioPlayerContainer);

AppRegistry.registerComponent('AudioPlayerContainer', () => AudioPlayerContainer);
const volumeMarginSide = 80;
const volumeMarginVertical = 10;
const playbackHorizontalMargin = 10;
const mainFgColor = '#FFFFFF';
const overImageShadowColor = 'rgb(0,0,0)';
const overImageShadowOffset = {width:1,height:1};
const overImageShadowRadious = 8;
const artworkPlaceholderColor = '#121314';
const textShadowStyle = {
  textShadowColor: overImageShadowColor,
  textShadowOffset: overImageShadowOffset,
  textShadowRadius : overImageShadowRadious,
}
const styles = StyleSheet.create({
  mainContainer:{
    flex:1
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems:'center',
    borderColor: 'lime',
    borderWidth: 0
  },
  startRow: {
    alignItems:'flex-end'
  },
  endRow:{
    alignItems:'flex-start'
  },
  centerRow:{

  },
  horizontalContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor:THEME.textOverlayBgColor
  },
  progressSlider : {
    flex:1,
  },
  playbackTime : Object.assign({
    textAlign: 'center',
    color: mainFgColor,
    textShadowColor: overImageShadowColor,
    height:30,
    lineHeight: 22,
    width:50
  },textShadowStyle),
  playbackTimeInitial:{
    marginLeft:10
  },
  playbackTrackContainer:{
    marginHorizontal: playbackHorizontalMargin
  },
  volumeSlider:{
    flex:1,
    justifyContent: 'center',
    marginHorizontal: volumeMarginSide
  },
  welcome: Object.assign({
    fontSize: 20,
    textAlign: 'center',
    color: mainFgColor,
    margin: 10,
    height: 30
  },textShadowStyle),
  playerIcon : {
    width:40,
    height:40
  },
  playerIconSmaller : {
    width: 35,
    height: 35
  },
  playerIconSuperSmall:{
    width: 30,
    height: 30
  },
  tracknameContainer:{
    flex:2,
    flexDirection:'column',
    justifyContent:'center',
    backgroundColor:THEME.textOverlayBgColor
  },
  playlistButtonView:{
    position:'absolute',
    bottom:0,
    zIndex :10
  },
  playlistButton:{
    paddingLeft:15,
    paddingBottom:15
  },
  trackname : Object.assign({
    fontSize: 20,
    textAlign: 'center',
    color: mainFgColor,
    backgroundColor: 'transparent',
    lineHeight: 32,
    height: 40,
    paddingLeft:20,
    paddingRight:20
  },textShadowStyle),
  artwork : {
    justifyContent: 'center',
    flexDirection:'row',
    flex:1
  },
  artworkImage : {
    flex:1,
    width:null,
    height:null,
    backgroundColor:artworkPlaceholderColor
  }
});
const sliderTrackStyles = {
  max : 'rgba(255,255,255,0.3)',
  min : mainFgColor
};
const markerStyle = {
  height:15,
  width:15,
  borderRadius: 7.5,
  backgroundColor:THEME.mainHighlightColor,
  borderWidth: 0,
  shadowColor:'black',
  shadowRadius:0,
  shadowOffset: { width:0,height:2},
  shadowOpacity: 0
};
export default AudioPlayerContainer;
