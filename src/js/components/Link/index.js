import { AnimationMixer, LoopOnce, Vector2 } from 'three'
import LoaderManager from '@/js/managers/LoaderManager'
import EnvManager from '@/js/managers/EnvManager'
import ControllerManager from '@/js/managers/ControllerManager'
import { EventBusSingleton } from 'light-event-bus'

import {
  createLinkToonMaterial,
  createLinkReceiveShadowMaterial,
  createPupilMaterial,
  createLinkBasicMaterial,
} from './LinkMaterials'
import {
  CLOSE_TREASURE,
  CUSTOM_LINK,
  DARK_LINK,
  END_CAMERA_LINK,
  SHOW_TREASURE,
  START_CAMERA_LINK,
  START_CAMERA_TREASURE_FOUND,
  TRIFORCE_FOUND,
} from '../../utils/constants'
import { MathUtils } from 'three'
const { degToRad } = MathUtils
import SoundManager, { SOUNDS_CONST } from '../../managers/SoundManager'
import { GLOBALS } from '../../utils/globals'

const NB_MOUTH = 8
const NB_EYES = 6

export default class Link {
  #debug
  #settings = {
    pupil: {
      dirX: 0,
      dirY: 0,
      scale: 1.05,
      switchMouth: false,
    },
    hatRX: 0,
    hatRY: 0,
    hatRZ: 0,
  }
  sailState = 0.01
  #scene
  #mesh
  #pupilLeft
  #pupilRight
  #mouth
  #mixer
  #mixerShield
  #masterAndShield
  #mixerMaster
  #shield
  #mouthIndex = 0
  #mouthTextures = []
  #eyeLeft
  #eyeRight
  #eyeLeftIndex = 0
  #eyeRightIndex = 0
  #eyesTextures = []
  #darkMouthTextures = []
  #isDark = false
  constructor({ debug, scene, gltf }) {
    this.#debug = debug
    this.#scene = scene

    this.#mesh = this._createMesh()

    this._createMaterials()

    this._createDebugFolder()

    //

    this.hatBoneA = this.#mesh.getObjectByName('hatA_jnt')
    this.hatBoneB = this.#mesh.getObjectByName('hatB_jnt')
    this.hatBoneC = this.#mesh.getObjectByName('hatC_jnt')

    this.hair1A = this.#mesh.getObjectByName('hair1A_jnt')
    this.hair1B = this.#mesh.getObjectByName('hair1B_jnt')
    this.hair2A = this.#mesh.getObjectByName('hair2A_jnt')
    this.hair2B = this.#mesh.getObjectByName('hair2B_jnt')

    this.hatBoneARotZ = -0.92 // FIX because default rotation is clear after animation is ready

    // Set up stance animation
    const animations = gltf.animations

    this.#mixer = new AnimationMixer(this.#mesh)
    this.#mixerShield = new AnimationMixer(this.#shield)
    this.#mixerMaster = new AnimationMixer(this.#masterAndShield)

    animations.forEach((animation) => {
      if (animation.name === 'stance') {
        const action = this.#mixer.clipAction(animation)
        this.actionStance = action
        action.play()
      } else if (animation.name === 'stanceCustomLink') {
        const action = this.#mixer.clipAction(animation)
        action.clampWhenFinished = true
        action.setLoop(LoopOnce)
        // action.play()
        this.actionCustomLink = action
      } else if (animation.name === 'shieldAction') {
        // Animation for shield
        this.actionShield = this.#mixerShield.clipAction(animation)
        this.actionShield.play()
      } else if (animation.name === 'MasterAction') {
        this.actionMaster = this.#mixerMaster.clipAction(animation)
        this.actionMaster.play()
      } else if (animation.name === 'MasterTreasure') {
        const action = this.#mixerMaster.clipAction(animation)
        action.clampWhenFinished = true
        action.setLoop(LoopOnce)
        this.actionMasterTreasure = action
      } else if (animation.name === 'stanceTreasure') {
        // Animation for treasure
        const action = this.#mixer.clipAction(animation)
        action.clampWhenFinished = true
        action.setLoop(LoopOnce)
        this.actionTreasure = action
      }
    })

    // Events
    EventBusSingleton.subscribe(START_CAMERA_LINK, this._playHeadAnimation)
    EventBusSingleton.subscribe(START_CAMERA_TREASURE_FOUND, this._playTreasureAnimation)
    EventBusSingleton.subscribe(CLOSE_TREASURE, this._resetTreasureAnimation)
    EventBusSingleton.subscribe(END_CAMERA_LINK, this._reverseHeadAnimation)
    EventBusSingleton.subscribe(CUSTOM_LINK, this._customFace)
    EventBusSingleton.subscribe(DARK_LINK, this._setDarkLink)
    EventBusSingleton.subscribe(TRIFORCE_FOUND, this._setMaster)

    this._setMaster() // set master if localstorage triforce true already

    // on animation finish
    this.#mixer.addEventListener('finished', (e) => {
      if (e.action === this.actionTreasure) {
        SoundManager.play(SOUNDS_CONST.TREASURE_FOUND)
        EventBusSingleton.publish(SHOW_TREASURE)
      }
    })
  }

  _playHeadAnimation = () => {
    this.actionCustomLink.paused = false
    this.actionCustomLink.timeScale = 1
    this.actionCustomLink.play()
  }

  _reverseHeadAnimation = () => {
    this.actionCustomLink.paused = false
    this.actionCustomLink.timeScale = -1
    this.actionCustomLink.play()
    this.#mixer.update(5)
  }

  _playTreasureAnimation = () => {
    this.actionCustomLink.stop()
    this.actionCustomLink.time = 0

    this.actionStance.stop()
    // get correct rotation:
    this.#mesh.rotation.z = degToRad(2.4)
    this.actionTreasure.paused = false
    this.actionTreasure.time = 0
    this.actionTreasure.timeScale = 1
    this.actionTreasure.play()

    // Master shield animation
    this.actionShield.stop()
    this.actionMaster.stop()
    this.actionMasterTreasure.paused = false
    this.actionMasterTreasure.time = 0
    this.actionMasterTreasure.timeScale = 1
    this.actionMasterTreasure.play()

    let arrMouth = this.#mouthTextures
    if (this.#isDark) {
      arrMouth = this.#darkMouthTextures
    }
    this.#mouthIndex = 5
    this.#mouth.material = createLinkReceiveShadowMaterial(arrMouth[this.#mouthIndex])
    this.#mouth.material.uSRGBSpace.value = 1
  }

  _resetTreasureAnimation = () => {
    this.actionTreasure.stop()
    this.actionStance.play()
    // get correct rotation:
    this.#mesh.rotation.z = degToRad(87.6)

    // Master shield animation
    this.actionMasterTreasure.stop()
    this.actionMaster.play()

    this.actionShield.play()

    let arrMouth = this.#mouthTextures
    if (this.#isDark) {
      arrMouth = this.#darkMouthTextures
    }
    this.#mouthIndex = 0
    this.#mouth.material = createLinkReceiveShadowMaterial(arrMouth[this.#mouthIndex])
    this.#mouth.material.uSRGBSpace.value = 1
  }

  _createMaterials() {
    const eyebrowLeft = this.#mesh.getObjectByName('link-eyebrowLeft')
    const eyebrowRight = this.#mesh.getObjectByName('link-eyebrowRight')
    const eyeLeft = this.#mesh.getObjectByName('link-eyeLeft')
    const eyeRight = this.#mesh.getObjectByName('link-eyeRight')
    const pupilLeft = this.#mesh.getObjectByName('link-pupilLeft')
    const pupilRight = this.#mesh.getObjectByName('link-pupilRight')
    this.#mouth = this.#mesh.getObjectByName('link-mouth')

    this.#shield = this.#mesh.getObjectByName('link-shield')
    this.#masterAndShield = this.#mesh.getObjectByName('link-master-sword-shield')

    // replace materials with TSL toon / receive shadow
    const receiveShadowNames = [
      'link-arms-bassin',
      'link-body-ears',
      'link-hair',
      'link-head',
      'link-hat',
    ]
    this.#mesh.children.forEach((child) => {
      if (child.type === 'SkinnedMesh' || child.type === 'Mesh') {
        const mapTexture = child.material?.map ?? LoaderManager.defaultTexture
        if (receiveShadowNames.includes(child.name)) {
          child.castCustomShadow = true
          child.material = createLinkReceiveShadowMaterial(mapTexture)
        } else {
          child.material = createLinkToonMaterial(mapTexture)
        }
      }
    })

    // Shield: receive shadow
    const textureShield = this.#shield.material?.map ?? LoaderManager.defaultTexture
    this.#shield.castCustomShadow = true
    this.#shield.material = createLinkReceiveShadowMaterial(textureShield)

    // Master shield and sword
    this.#masterAndShield.children.forEach((child) => {
      if (child.type === 'SkinnedMesh' || child.type === 'Mesh') {
        const mapTexture = child.material?.map ?? LoaderManager.defaultTexture
        child.castCustomShadow = true
        child.material = createLinkReceiveShadowMaterial(mapTexture)
      }
    })

    this.#masterAndShield.visible = false
    this.#masterAndShield.canVisible = false

    // Eyebrows and eyes: basic transparent with updatable map
    const texEyebrowLeft = LoaderManager.get('eyebrow-1').texture
    texEyebrowLeft.flipY = false
    eyebrowLeft.material = createLinkBasicMaterial(texEyebrowLeft)
    eyebrowRight.material = createLinkBasicMaterial(texEyebrowLeft)

    for (let i = 0; i < NB_EYES; i++) {
      const tex = LoaderManager.get(`eye-${i + 1}`).texture
      tex.flipY = false
      this.#eyesTextures.push(tex)
    }

    eyeLeft.material = createLinkBasicMaterial(this.#eyesTextures[this.#eyeLeftIndex])
    eyeLeft.renderOrder = 1
    this.#eyeLeft = eyeLeft

    eyeRight.material = createLinkBasicMaterial(this.#eyesTextures[this.#eyeRightIndex])
    eyeRight.renderOrder = 1
    this.#eyeRight = eyeRight

    // Pupils: toon + UV transform + mask
    const texPupil = LoaderManager.get('pupil').texture
    texPupil.flipY = false
    pupilLeft.material = createPupilMaterial(texPupil, this.#eyesTextures[this.#eyeLeftIndex])
    pupilLeft.material.uFlip.value = -1
    pupilLeft.material.uDir.value = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
    pupilLeft.material.uScale.value = this.#settings.pupil.scale
    pupilLeft.renderOrder = 100

    pupilRight.material = createPupilMaterial(texPupil, this.#eyesTextures[this.#eyeRightIndex])
    pupilRight.material.uFlip.value = 1
    pupilRight.material.uDir.value = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
    pupilRight.material.uScale.value = this.#settings.pupil.scale
    pupilRight.renderOrder = 100

    this.#pupilLeft = pupilLeft
    this.#pupilRight = pupilRight

    // Mouth textures: no colorSpace so sampled as-is (match WebGL mouth.frag: map used raw, shading in sRGB)
    for (let i = 0; i < NB_MOUTH; i++) {
      const tex = LoaderManager.get(`mouth${i + 1}`).texture
      tex.flipY = false
      this.#mouthTextures.push(tex)
    }
    for (let i = 0; i < NB_MOUTH; i++) {
      const tex = LoaderManager.get(`dark-mouth${i + 1}`).texture
      tex.flipY = false
      this.#darkMouthTextures.push(tex)
    }

    this.#mouth.material = createLinkReceiveShadowMaterial(this.#mouthTextures[this.#mouthIndex])
    this.#mouth.material.uSRGBSpace.value = 1 // match WebGL mouth.frag: shading in sRGB
    this.#mouth.receiveCustomShadow = true
  }

  _createMesh() {
    const mesh = this.#scene.getObjectByName('link')

    // get correct rotation:
    mesh.rotation.z = degToRad(87.6)

    return mesh
  }

  _customFace = ({ type, incr, el }) => {
    let arrMouth = this.#mouthTextures
    if (this.#isDark) {
      arrMouth = this.#darkMouthTextures
    }
    if (type === 'mouth') {
      this.#mouthIndex += incr
      if (this.#mouthIndex < 0) {
        this.#mouthIndex = NB_MOUTH - 1
      } else if (this.#mouthIndex > NB_MOUTH - 1) {
        this.#mouthIndex = 0
      }

      this.#mouth.material = createLinkReceiveShadowMaterial(arrMouth[this.#mouthIndex])
      this.#mouth.material.uSRGBSpace.value = 1

      el.innerHTML = this.#mouthIndex + 1
    } else if (type === 'eye-left') {
      this.#eyeLeftIndex += incr
      if (this.#eyeLeftIndex < 0) {
        this.#eyeLeftIndex = NB_EYES - 1
      } else if (this.#eyeLeftIndex > NB_EYES - 1) {
        this.#eyeLeftIndex = 0
      }

      this.#eyeLeft.material = createLinkBasicMaterial(this.#eyesTextures[this.#eyeLeftIndex])
      const texPupil = LoaderManager.get(this.#isDark ? 'dark_pupil' : 'pupil').texture
      this.#pupilLeft.material = createPupilMaterial(texPupil, this.#eyesTextures[this.#eyeLeftIndex])
      this.#pupilLeft.material.uFlip.value = -1
      this.#pupilLeft.material.uDir.value = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
      this.#pupilLeft.material.uScale.value = this.#settings.pupil.scale

      el.innerHTML = this.#eyeLeftIndex + 1
    } else if (type === 'eye-right') {
      this.#eyeRightIndex += incr
      if (this.#eyeRightIndex < 0) {
        this.#eyeRightIndex = NB_EYES - 1
      } else if (this.#eyeRightIndex > NB_EYES - 1) {
        this.#eyeRightIndex = 0
      }

      this.#eyeRight.material = createLinkBasicMaterial(this.#eyesTextures[this.#eyeRightIndex])
      const texPupilR = LoaderManager.get(this.#isDark ? 'dark_pupil' : 'pupil').texture
      this.#pupilRight.material = createPupilMaterial(texPupilR, this.#eyesTextures[this.#eyeRightIndex])
      this.#pupilRight.material.uFlip.value = 1
      this.#pupilRight.material.uDir.value = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
      this.#pupilRight.material.uScale.value = this.#settings.pupil.scale

      el.innerHTML = this.#eyeRightIndex + 1
    }
  }

  _setDarkLink = () => {
    this.#isDark = true
    const darkTunic = LoaderManager.get('dark_tunic').texture
    darkTunic.flipY = false
    darkTunic.needsUpdate = true

    const texPupil = LoaderManager.get('dark_pupil').texture
    texPupil.flipY = false
    texPupil.needsUpdate = true

    const receiveShadowNames = [
      'link-arms-bassin',
      'link-body-ears',
      'link-hair',
      'link-head',
      'link-hat',
    ]
    const darkBodyNames = [
      'link-arms-bassin',
      'link-belt',
      'link-body-ears',
      'link-hair',
      'link-handLeft',
      'link-handRight',
      'link-hat',
      'link-head',
      'link-legs',
      'link-nose',
    ]
    this.#mesh.children.forEach((child) => {
      if ((child.type === 'SkinnedMesh' || child.type === 'Mesh') && darkBodyNames.includes(child.name)) {
        const mat = receiveShadowNames.includes(child.name)
          ? createLinkReceiveShadowMaterial(darkTunic)
          : createLinkToonMaterial(darkTunic)
        mat.uSRGBSpace.value = 1
        child.material = mat
      }
    })

    this.#mouth.material = createLinkReceiveShadowMaterial(this.#darkMouthTextures[this.#mouthIndex])
    this.#mouth.material.uSRGBSpace.value = 1
    this.#mouth.receiveCustomShadow = true

    this.#pupilLeft.material = createPupilMaterial(texPupil, this.#eyesTextures[this.#eyeLeftIndex])
    this.#pupilLeft.material.uFlip.value = -1
    this.#pupilLeft.material.uDir.value = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
    this.#pupilLeft.material.uScale.value = this.#settings.pupil.scale

    this.#pupilRight.material = createPupilMaterial(texPupil, this.#eyesTextures[this.#eyeRightIndex])
    this.#pupilRight.material.uFlip.value = 1
    this.#pupilRight.material.uDir.value = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
    this.#pupilRight.material.uScale.value = this.#settings.pupil.scale
  }

  _setMaster = () => {
    setTimeout(() => {
      if (GLOBALS.triforce) {
        this.#shield.visible = false
        this.#shield.canVisible = false
        this.#masterAndShield.visible = true
        this.#masterAndShield.canVisible = true
      }
    }, 1000)
  }

  /**
   * Update
   */
  update({ time, delta }) {
    this.#mixer?.update(0.07)
    this.#mixerShield?.update(0.07)
    this.#mixerMaster?.update(0.07)

    this.hatBoneA.rotation.z = this.hatBoneARotZ + 0.88 * ControllerManager.boat.velocityP
    this.hatBoneB.rotation.z = Math.sin(time * 10) * 0.3 * ControllerManager.boat.velocityP
    this.hatBoneC.rotation.z = Math.sin(time * 15) * 0.4 * ControllerManager.boat.velocityP

    this.hair1A.rotation.z = Math.sin(time * 20) * 0.3 * ControllerManager.boat.velocityP
    this.hair2A.rotation.z = Math.sin(time * 15) * 0.4 * ControllerManager.boat.velocityP

    const pupilDir = new Vector2(ControllerManager.boat.turnForce * 0.8, 0)
    this.#pupilRight.material.uDir.value = pupilDir
    this.#pupilLeft.material.uDir.value = pupilDir

    // Sync env uniforms so sunDir and shadow camera stay correct (like WebGL uniforms)
    this._syncLinkEnvUniforms(this.#mesh)
    this._syncLinkEnvUniforms(this.#shield)
    this._syncLinkEnvUniforms(this.#masterAndShield)
    if (this.#mouth?.material?.uSunDir) {
      this._syncMaterialEnvUniforms(this.#mouth.material)
    }
  }

  _syncLinkEnvUniforms(object) {
    if (!object) return
    object.traverse((child) => {
      if (child.type === 'SkinnedMesh' || child.type === 'Mesh') {
        if (child.material?.uSunDir) this._syncMaterialEnvUniforms(child.material)
      }
    })
  }

  _syncMaterialEnvUniforms(material) {
    if (EnvManager.sunDir?.position) material.uSunDir.value = EnvManager.sunDir.position
    if (material.uAmbientColor && EnvManager.ambientLight?.color) material.uAmbientColor.value = EnvManager.ambientLight.color
    if (material.uCoefShadow != null && EnvManager.settings?.coefShadow != null) material.uCoefShadow.value = EnvManager.settings.coefShadow
    if (material.uShadowCameraP && EnvManager.sunShadowMap?.camera?.projectionMatrix) material.uShadowCameraP.value = EnvManager.sunShadowMap.camera.projectionMatrix
    if (material.uShadowCameraV && EnvManager.sunShadowMap?.camera?.matrixWorldInverse) material.uShadowCameraV.value = EnvManager.sunShadowMap.camera.matrixWorldInverse
  }

  resize({ width, height }) {}

  /**
   * Debug
   */
  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      const dir = new Vector2(this.#settings.pupil.dirX, this.#settings.pupil.dirY)
      this.#pupilLeft.material.uDir.value = dir
      this.#pupilRight.material.uDir.value = dir
      this.#pupilLeft.material.uScale.value = this.#settings.pupil.scale
      this.#pupilRight.material.uScale.value = this.#settings.pupil.scale

      if (this.#settings.pupil.switchMouth) {
        this.#mouth.material = createLinkReceiveShadowMaterial(LoaderManager.get('mouth7').texture)
      } else {
        this.#mouth.material = createLinkReceiveShadowMaterial(LoaderManager.get('mouth1').texture)
      }
      this.#mouth.material.uSRGBSpace.value = 1
    }

    const debug = this.#debug.addFolder({ title: 'Link', expanded: false })

    debug.addInput(this.#settings.pupil, 'dirX').on('change', settingsChangedHandler)
    debug.addInput(this.#settings.pupil, 'dirY').on('change', settingsChangedHandler)
    debug.addInput(this.#settings.pupil, 'scale').on('change', settingsChangedHandler)
    debug.addInput(this.#settings.pupil, 'switchMouth').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'hatRX').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'hatRY').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'hatRZ').on('change', settingsChangedHandler)

    const btn = debug.addButton({
      title: 'Copy settings',
      label: 'copy', // optional
    })

    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })

    return debug
  }
}
